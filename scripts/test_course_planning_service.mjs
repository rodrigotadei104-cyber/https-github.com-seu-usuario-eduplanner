import assert from 'node:assert/strict';
import { build } from 'esbuild';
const harness = { tenant: 'tenant', allowed: true, calls: [], reply: null, thrown: null };
globalThis.courseServiceTest = harness;
const output = await build({ entryPoints: ['services/coursePlanning.service.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
    name: 'isolated-service-dependencies', setup(build) {
        build.onResolve({ filter: /(lib\/supabase|tenant\.service|permission\.service)$/ }, args => ({ path: args.path, namespace: 'test' }));
        build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path.endsWith('tenant.service') ? 'export const tenantService={getCurrentTenantId(){if(!globalThis.courseServiceTest.tenant)throw Error("Sem unidade");return globalThis.courseServiceTest.tenant;}};' : args.path.endsWith('permission.service') ? 'export const permissionService={hasPermission(){return globalThis.courseServiceTest.allowed;}};' : 'export const supabase={async rpc(name,args){const h=globalThis.courseServiceTest;h.calls.push({name,args});if(h.thrown)throw h.thrown;return h.reply;}};', loader: 'js' }));
    }
}] });
const { coursePlanningService: service, CourseCommitUncertainError } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const planning = { routine: null, loaded_at: '2026-11-22T20:00:00Z', history_from: '2026-08-30', history_to: '2026-11-21', aulas: [], eventos: [], historico: [], feriados: [], bloqueios: [] };
const data = { curso: { id: 'course', tenant_id: 'tenant', nome_curso: '40h', carga_total_horas: 40, tipo_hora_min: '50', ativo: true },
    disciplinas: [{ id: 'subject', tenant_id: 'tenant', curso_id: 'course', nome_disciplina: 'Teoria', carga_horas: 40, tipo_disciplina: 'teorica', ordem: 1 }], planejamento: planning, sala: [] };
harness.reply = { data, error: null };
const loaded = await service.load('course', 'teacher', '2027-01-11', '2027-01-20', ' Sala 1 ');
assert.equal(loaded.course.cargaTotalHoras, 40); assert.equal(loaded.subjects[0].cargaHoras, 40);
assert.equal(harness.calls.at(-1).args.p_sala, 'Sala 1');
harness.reply = { data: { ...data, curso: { ...data.curso, tenant_id: 'foreign' } }, error: null };
await assert.rejects(service.load('course', 'teacher', '2027-01-11', '2027-01-20', ''), /unidade/);
harness.reply = { data: { ...data, planejamento: { ...planning, eventos: null } }, error: null };
await assert.rejects(service.load('course', 'teacher', '2027-01-11', '2027-01-20', ''), /incompleta/);
harness.reply = { data: null, error: { code: 'PGRST202', message: 'missing' } };
await assert.rejects(service.load('course', 'teacher', '2027-01-11', '2027-01-20', ''), /ainda não está habilitado/);
const request = { id: 'operation', curso: 'course', instrutor: 'teacher', numero: '40', sala: 'Sala 1', inicioBusca: '2027-01-11', fimBusca: '2027-01-20', aulas: [{ data: '2027-01-11', inicio: '08:00', fim: '12:00', disciplinaId: 'subject' }] };
harness.allowed = false;
const count = harness.calls.length;
await assert.rejects(service.submit(request, false), /permissão/); assert.equal(harness.calls.length, count);
harness.allowed = true;
harness.reply = { data: { applied: false, turmaId: null, count: 1, snapshot: { source: 'fresh' } }, error: null };
const preview = await service.submit(request, false); assert.equal(preview.applied, false);
harness.reply = { data: { applied: true, turmaId: request.id, count: 1, snapshot: preview.snapshot }, error: null };
assert.equal((await service.submit(request, true, preview.snapshot)).applied, true);
assert.deepEqual(harness.calls.at(-1).args, { p_pedido: request, p_aplicar: true, p_expected: preview.snapshot });
harness.reply = { data: { applied: false, turmaId: null, count: 1 }, error: null };
await assert.rejects(service.submit(request, false), /incompleta/);
harness.reply = { data: null, error: { message: 'Failed to fetch' } };
await assert.rejects(service.submit(request, true, preview.snapshot), CourseCommitUncertainError);
harness.reply = { data: null, error: { code: 'P0001', message: 'Há conflito.' } };
await assert.rejects(service.submit(request, true, preview.snapshot), /Há conflito/);
harness.thrown = new TypeError('Lost connection');
await assert.rejects(service.submit(request, true, preview.snapshot), CourseCommitUncertainError);
console.log('OK: serviço real, leitura completa, isolamento, autorização, protocolo de conferência e resposta perdida.');
