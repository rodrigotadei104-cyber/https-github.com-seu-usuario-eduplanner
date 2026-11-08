import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Executa o método real de edição com banco e permissões simulados; não acessa produção.
const original = { id: 'aula', tenant_id: 'unidade', instrutor_id: 'antigo', curso_id: 'curso',
    sala: 'Sala 4', data: '2026-11-14', horario_inicio: '18:00:00', horario_fim: '22:00:00',
    status: 'agendada', carga_horaria_materia: 4 };
let saved, instructorCalls, roomCalls, instructorConflict = false, roomConflict = false;
class Query {
    constructor(table) { this.table = table; }
    select() { return this; }
    eq() { return this; }
    update(input) { this.input = input; return this; }
    async single() {
        if (this.input) { saved = { ...original, ...this.input }; return { data: saved, error: null }; }
        return { data: this.table === 'cursos' ? { minutos_por_hora: 60 } : { ...original }, error: null };
    }
}
globalThis.conflictScopeDeps = {
    supabase: { from: table => new Query(table) },
    tenantService: { validateTenantAccess: async () => true },
    permissionService: { checkPermission: async () => true },
    auditService: { log: async () => {} }
};
const source = readFileSync(new URL('../services/aula.service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const code = 'const { supabase, tenantService, permissionService, auditService } = globalThis.conflictScopeDeps;\n'
    + compiled.replace(/^import .*;\r?\n/gm, '');
const { aulaService } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
aulaService.checkInstructorConflict = async data => { instructorCalls.push(data); return { hasConflict: instructorConflict, conflicts: [] }; };
aulaService.checkRoomConflict = async data => { roomCalls.push(data); return { hasConflict: roomConflict, conflicts: [] }; };
aulaService.checkCourseCompletion = async () => {};
const reset = () => { saved = null; instructorCalls = []; roomCalls = []; instructorConflict = false; roomConflict = false; };

reset(); roomConflict = true;
let result = await aulaService.update('aula', { instrutor_id: 'novo', sala: 'Sala 4', data: '2026-11-14', horario_inicio: '18:00', horario_fim: '22:00' });
assert.equal(result.success, true, 'Trocar só o instrutor não deve disparar conflito da sala inalterada');
assert.equal(saved.instrutor_id, 'novo'); assert.equal(saved.sala, 'Sala 4');
assert.equal(instructorCalls.length, 1); assert.equal(roomCalls.length, 0);

reset(); instructorConflict = true;
result = await aulaService.update('aula', { instrutor_id: 'novo' });
assert.equal(result.warning, 'INSTRUCTOR_CONFLICT'); assert.equal(saved, null);

reset(); roomConflict = true;
result = await aulaService.update('aula', { sala: 'Sala 5' });
assert.equal(result.warning, 'ROOM_CONFLICT'); assert.equal(saved, null);
assert.equal(instructorCalls.length, 0); assert.equal(roomCalls[0].sala, 'Sala 5');

for (const input of [{ data: '2026-11-15' }, { horario_inicio: '19:00' }, { horario_fim: '23:00' }]) {
    reset(); await aulaService.update('aula', input);
    assert.equal(instructorCalls.length, 1); assert.equal(roomCalls.length, 1);
    assert.equal(roomCalls[0].excludeAulaId, 'aula');
}
reset(); await aulaService.update('aula', { sala: '' });
assert.equal(saved.sala, ''); assert.equal(roomCalls.length, 0);
reset(); await aulaService.update('aula', { observacoes: 'Texto' });
assert.equal(instructorCalls.length, 0); assert.equal(roomCalls.length, 0);
reset(); await aulaService.update('aula', { instrutor_id: 'novo', sala: 'Sala 5' }, true);
assert.equal(instructorCalls.length, 0); assert.equal(roomCalls.length, 0); assert.equal(saved.instrutor_id, 'novo');
console.log('OK: troca de instrutor não acusa sala inalterada; conflitos reais de instrutor, sala, data e horário continuam validados.');
