import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async(path,prefix='')=>{
 const src=readFileSync(new URL(path,import.meta.url),'utf8');const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(prefix+code.replace(/^import .*;\r?\n/gm,'')).toString('base64')}`);
};
const turma=await load('../utils/turmaChanges.ts');
globalThis.planningDeps={localDateKey:turma.localDateKey};
const dateUtils=await load('../utils/turmaReschedule.ts','const {localDateKey}=globalThis.planningDeps;\n');
globalThis.planningDeps={...globalThis.planningDeps,validDateKey:dateUtils.validDateKey};
const h=await load('../utils/instructorPlanning.ts','const {localDateKey,validDateKey}=globalThis.planningDeps;\n');
const base={from:'2026-11-09',to:'2026-11-09',routine:[{dia:1,inicio:'08:00',fim:'12:00'},{dia:1,inicio:'13:00',fim:'17:00'}],
 bookings:[],blocks:[],simulated:[],exploreStart:'06:00',exploreEnd:'22:00',duration:60,now:new Date(2026,10,8,12)};
const booking=(id,inicio,fim,rest={})=>({id,data:'2026-11-09',inicio,fim,descricao:'Aula',...rest});
let result=h.computeInstructorPlanning({...base,bookings:[booking('1','09:00','10:00'),booking('2','09:30','11:00'),booking('3','14:00','15:00')]})[0];
assert.deepEqual(result.livres.map(s=>[s.inicio,s.fim]),[['08:00','09:00'],['11:00','12:00'],['13:00','14:00'],['15:00','17:00']]);
assert.deepEqual(result.alternativas.map(s=>[s.inicio,s.fim]),[['06:00','08:00'],['17:00','22:00']]);
assert.equal(h.validateRoutine([{dia:1,inicio:'08:00',fim:'12:00'},{dia:1,inicio:'11:00',fim:'13:00'}])!==null,true);
assert.equal(h.computeInstructorPlanning({...base,blocks:[{data:base.from,descricao:'Feriado'}]})[0].alternativas.length,0);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('f','00:00','00:00',{diaInteiro:true})]})[0].livres.length,0);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('erro','','')]})[0].livres.length,0);
assert.equal(h.computeInstructorPlanning({...base,routine:[]})[0].livres.length,0);
assert.deepEqual(h.computeInstructorPlanning({...base,simulated:[{data:base.from,inicio:'08:00',fim:'10:00',habitual:true}]})[0].livres[0],{data:base.from,inicio:'10:00',fim:'12:00',habitual:true,comportaBloco:true});
assert.equal(h.computeInstructorPlanning({...base,now:new Date(2026,10,9,10,30)})[0].livres[0].inicio,'10:31');
assert.throws(()=>h.planningDates('2026-01-01','2026-12-31'),/180/);
assert.deepEqual(h.planningDates('9999-12-31','9999-12-31'),['9999-12-31']);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('seconds','08:00:00','09:00:30')]})[0].livres[0].inicio,'09:01');
assert.throws(()=>h.computeInstructorPlanning({...base,duration:0}),/duração/);
// Giovanna: a rotina pode ter apenas 3h/3h20 livres, enquanto o bloco padrão é 4h.
const giovanna=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:240,
 routine:[{dia:1,inicio:'13:00',fim:'16:20'},{dia:1,inicio:'19:00',fim:'22:00'}]})[0];
assert.deepEqual(giovanna.livres.map(s=>[s.inicio,s.fim,s.comportaBloco]),[['13:00','16:20',false],['19:00','22:00',false]]);
const smaller=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:180,
 routine:[{dia:1,inicio:'13:00',fim:'16:20'},{dia:1,inicio:'19:00',fim:'22:00'}]})[0];
assert.equal(smaller.livres.every(s=>s.comportaBloco),true);
const realJourney=[{dia:1,inicio:'13:00',fim:'17:00'},{dia:1,inicio:'18:00',fim:'22:00'}];
const meal=[{dia:1,inicio:'18:00',fim:'19:00',descricao:'Janta'}];
for(const duration of [50,180,240]){
 const d=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration,routine:realJourney,breaks:meal})[0];
 assert.deepEqual(d.livres.map(s=>[s.inicio,s.fim]),[['13:00','17:00'],['19:00','22:00']]);
 for(const s of [...d.livres,...d.alternativas])assert.equal(h.planningMinutes(s.inicio)<1140&&h.planningMinutes(s.fim)>1080,false,'janta não aparece dentro ou fora da rotina');
 assert.equal(d.pausas[0].descricao,'Janta');
}
const pedagogical=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:50,routine:realJourney,breaks:meal,
 bookings:[{id:'50min',data:'2027-01-11',inicio:'19:00',fim:'21:30',descricao:'3 aulas de 50 minutos'}]})[0];
assert.equal(pedagogical.livres.some(s=>s.inicio==='18:00'),false);
assert.equal(pedagogical.livres.find(s=>s.inicio==='21:30').comportaBloco,false,'resíduo de 30 minutos não comporta aula de 50');
const history=[booking('a','08:00','10:00',{data:'2026-10-19'}),booking('b','10:00','12:00',{data:'2026-10-19'}),booking('c','09:00','13:00',{data:'2026-10-26'}),booking('d','19:00','21:00',{data:'2026-10-27'})];
assert.deepEqual(h.suggestInstructorRoutine(history,'2026-10-01','2026-10-31').windows,[{dia:1,inicio:'09:00',fim:'12:00'}]);
assert.equal(h.suggestInstructorRoutine(history.slice(0,2),'2026-10-01','2026-10-31').windows.length,0,'fragmentos no mesmo dia não são duas evidências');
// Propriedade: nenhum minuto devolvido pode colidir com ocupação; toda faixa livre útil deve ser preservada.
let seed=17;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(let test=0;test<80;test++){
 const intervals=Array.from({length:8},(_,i)=>{const a=480+Math.floor(random()*500),b=Math.min(1020,a+1+Math.floor(random()*90));return booking(String(i),h.planningTime(a),h.planningTime(b));});
 const output=h.computeInstructorPlanning({...base,routine:[{dia:1,inicio:'08:00',fim:'17:00'}],bookings:intervals,duration:15})[0];
 const occupied=new Set();intervals.forEach(b=>{for(let m=h.planningMinutes(b.inicio);m<h.planningMinutes(b.fim);m++)occupied.add(m);});
 const expected=new Set();let start=480;
 while(start<1020){if(occupied.has(start)){start++;continue;}let end=start;while(end<1020&&!occupied.has(end))end++;for(let m=start;m<end;m++)expected.add(m);start=end;}
 const actual=new Set();for(const s of output.livres)for(let m=h.planningMinutes(s.inicio);m<h.planningMinutes(s.fim);m++){assert.equal(occupied.has(m),false);actual.add(m);}
 assert.deepEqual(actual,expected);
}
let calls=[],allowed=true,error=null;
const reply={loaded_at:'2026-11-08T12:00:00Z',history_from:'2026-08-16',history_to:'2026-11-07',routine:null,aulas:[],historico:[],eventos:[],feriados:[],bloqueios:[]};
globalThis.planningServiceDeps={validateRoutine:h.validateRoutine,planningDates:h.planningDates,validDateKey:dateUtils.validDateKey,
 tenantService:{getCurrentTenantId:()=> 'T'},permissionService:{checkPermission:async()=>allowed},supabase:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='salvar_rotina_instrutor'?{janelas:args.p_janelas,pausas:args.p_pausas,updated_at:'2026-11-08T12:00:00Z'}:reply,error};}}};
const {instructorPlanningService:svc}=await load('../services/instructorPlanning.service.ts','const {validateRoutine,planningDates,validDateKey,tenantService,permissionService,supabase}=globalThis.planningServiceDeps;\n');
assert.equal((await svc.load('i',base.from,base.to)).routine.updated_at,null);
assert.equal(calls[0].name,'consultar_planejamento_instrutor');
await svc.save('i',realJourney,null,meal);
assert.deepEqual(calls.at(-1).args.p_pausas,meal);
reply.routine={janelas:realJourney,pausas:meal,updated_at:'2026-11-08T12:00:00Z'};
reply.eventos=[{id:'protected',data:'2026-11-09',inicio:'18:00',fim:'19:00',descricao:'Janta',protegido:true}];
const withBreak=await svc.load('i',base.from,base.to);
assert.deepEqual(withBreak.routine.pausas,meal);
assert.equal(withBreak.bookings.length,0,'pausa legada não duplica nem impede revisão explícita da configuração local');
allowed=false;const count=calls.length;await assert.rejects(()=>svc.save('i',[],null),/permissão/);assert.equal(calls.length,count);
error={code:'PGRST202'};await assert.rejects(()=>svc.load('i',base.from,base.to),/não está habilitado/);
error=null;reply.aulas=null;await assert.rejects(()=>svc.load('i',base.from,base.to),/incompleta/);
console.log('OK: disponibilidade, rotina, intervalos, exceções, bloqueios, histórico, propriedades aleatórias e falhas de consulta.');
