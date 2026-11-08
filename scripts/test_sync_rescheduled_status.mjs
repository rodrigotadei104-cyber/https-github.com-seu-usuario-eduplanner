import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const RealDate = Date;
const instant = new RealDate(2026, 10, 8, 12, 0, 0);
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [instant.getTime()])); } };
let rows = ['future','today-later','cancelled','past-real'].map(id => ({ id, data: '2026-11-05', horario_inicio: '18:40:00', horario_fim: '22:00:00', status: 'agendada' }));
rows.push(...['progress-real','progress-moved'].map(id => ({ id, data: '2026-11-08', horario_inicio: '11:00:00', horario_fim: '13:00:00', status: 'agendada' })));
class Query {
    filters = []; input;
    select() { return this; }
    neq(k,v) { this.filters.push(r=>r[k]!==v); return this; }
    eq(k,v) { this.filters.push(r=>r[k]===v); return this; }
    lte(k,v) { this.filters.push(r=>r[k]<=v); return this; }
    gt(k,v) { this.filters.push(r=>r[k]>v); return this; }
    in(k,vs) { this.filters.push(r=>vs.includes(r[k])); return this; }
    or(value) {
        assert.equal(value,'data.lt.2026-11-08,and(data.eq.2026-11-08,horario_fim.lte.12:00:00)');
        this.filters.push(r=>r.data<'2026-11-08'||(r.data==='2026-11-08'&&r.horario_fim<='12:00:00')); return this;
    }
    update(input) { this.input=input; return this; }
    then(resolve,reject) {
        const selected=rows.filter(r=>this.filters.every(f=>f(r)));
        if(this.input) selected.forEach(r=>Object.assign(r,this.input));
        else {
            // Mudanças concorrentes após a leitura e antes dos UPDATEs do sincronizador.
            const snapshot=structuredClone(selected);
            rows.find(r=>r.id==='future').data='2026-11-13';
            Object.assign(rows.find(r=>r.id==='today-later'),{data:'2026-11-08',horario_inicio:'18:40:00',horario_fim:'22:00:00'});
            rows.find(r=>r.id==='cancelled').status='cancelada';
            rows.find(r=>r.id==='progress-moved').data='2026-11-13';
            return Promise.resolve({data:snapshot,error:null}).then(resolve,reject);
        }
        return Promise.resolve({data:null,error:null}).then(resolve,reject);
    }
}
globalThis.syncDeps={supabase:{from:()=>new Query()},tenantService:{},permissionService:{},auditService:{log:async()=>{}}};
const src=readFileSync(new URL('../services/aula.service.ts',import.meta.url),'utf8');
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {aulaService}=await import(`data:text/javascript;base64,${Buffer.from('const {supabase,tenantService,permissionService,auditService}=globalThis.syncDeps;\n'+code.replace(/^import .*;\r?\n/gm,'')).toString('base64')}`);
await aulaService.syncClassStatuses();
assert.equal(rows.find(r=>r.id==='past-real').status,'concluida');
assert.equal(rows.find(r=>r.id==='progress-real').status,'em_andamento');
assert.equal(rows.find(r=>r.id==='cancelled').status,'cancelada');
for(const id of ['future','today-later','progress-moved']) assert.equal(rows.find(r=>r.id===id).status,'agendada',id);
globalThis.Date=RealDate;
console.log('OK: sincronização não sobrescreve reagendamentos ou cancelamentos feitos após a leitura.');
