import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async (path, prefix = '') => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(prefix + compiled.replace(/^import .*;\r?\n/gm, '')).toString('base64')}`);
};
const helpers = await load('../utils/turmaChanges.ts');
const now = new Date(2026, 10, 8, 12);
const base = { id: 'a', tenantId: 'T', turmaId: 'turma', cursoId: 'curso', materiaId: 'teoria', numeroTurma: '703601',
    data: new Date(2026, 10, 14), horarioInicio: '08:00:00', horarioFim: '10:00:00', status: 'agendada', instrutorId: 'antigo', sala: 'Sala 4' };
const aulas = [base, { ...base, id: 'b', horarioInicio: '10:00:00', materiaId: 'pratica' },
    { ...base, id: 'outro-dia', data: new Date(2026, 10, 21) }, { ...base, id: 'outro-instrutor', instrutorId: 'outro' },
    { ...base, id: 'concluida', status: 'concluida' }, { ...base, id: 'cancelada', status: 'cancelada' },
    { ...base, id: 'passada', data: new Date(2026, 10, 7) }, { ...base, id: 'sem-vinculo', turmaId: undefined, numeroTurma: undefined }];
const original = structuredClone(aulas);
assert.deepEqual(helpers.selectTurmaChanges(aulas, 'instrutor', 'antigo', 'novo', ['2026-11-14'], ['b'], now).map(a => a.id), ['a']);
assert.deepEqual(helpers.selectTurmaChanges(aulas, 'sala', 'Sala 4', 'Sala 4', ['2026-11-14'], [], now), []);
assert.equal(helpers.canChangeTurmaLesson({ ...base, data: new Date(2026, 10, 8), horarioInicio: '11:00' }, now), false);
assert.equal(helpers.turmaLessonExpectation(base).horarioInicio, undefined);
assert.equal(helpers.turmaLessonExpectation(base).horario_inicio, '08:00');
assert.equal(helpers.turmaLessonExpectation(base).data, '2026-11-14');
assert.deepEqual(aulas, original);
let allowed = true, rpcError, calls = [], reply;
globalThis.turmaChangesDeps = {
    tenantService: { getCurrentTenantId: () => 'T' }, permissionService: { checkPermission: async () => allowed },
    turmaLessonExpectation: helpers.turmaLessonExpectation,
    supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: reply, error: rpcError }; } }
};
const { turmaChangesService } = await load('../services/turmaChanges.service.ts', 'const { supabase, tenantService, permissionService, turmaLessonExpectation } = globalThis.turmaChangesDeps;\n');
reply = { snapshot: [helpers.turmaLessonExpectation(base)], conflicts: [], changedCount: 1, applied: false };
const preview = await turmaChangesService.preview([base], 'instrutor', 'novo');
assert.equal(calls[0].name, 'alterar_recursos_turma'); assert.equal(calls[0].args.p_aplicar, false);
assert.deepEqual(calls[0].args.p_expected, [helpers.turmaLessonExpectation(base)]);
reply = { ...preview, applied: true };
assert.equal((await turmaChangesService.apply(preview, 'instrutor', 'novo')).applied, true);
assert.equal(calls[1].args.p_aplicar, true); assert.deepEqual(calls[1].args.p_expected, preview.snapshot);
allowed = false; const before = calls.length;
await assert.rejects(() => turmaChangesService.preview([base], 'sala', 'Sala 5'), /permissão/);
assert.equal(calls.length, before);
allowed = true; rpcError = { code: 'PGRST202' };
await assert.rejects(() => turmaChangesService.preview([base], 'sala', 'Sala 5'), /não está habilitada/);
rpcError = { code: '23505' };
await assert.rejects(() => turmaChangesService.preview([base], 'sala', 'Sala 5'), /Nenhuma aula foi alterada/);
rpcError = null; reply = { ...preview, applied: false };
await assert.rejects(() => turmaChangesService.apply(preview, 'sala', 'Sala 5'), /não foi confirmada/);
console.log('OK: seleção respeita datas, origem, exclusões e status; prévia não aplica; confirmação usa snapshot e valida permissões.');
