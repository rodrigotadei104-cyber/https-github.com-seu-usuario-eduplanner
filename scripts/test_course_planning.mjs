import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['utils/coursePlanning.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { suggestCourseSchedule, validateCourseSessions, curriculumMinutes } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const course = { id: 'course', tenantId: 'tenant', nomeCurso: 'Curso 40h', tipoHoraMin: '50', cargaTotalHoras: 40, ativo: true };
const subject = (id, cargaHoras, ordem) => ({ id, tenantId: 'tenant', cursoId: 'course', nomeDisciplina: id, cargaHoras, ordem });
const base = { course, subjects: [subject('b', 20, 2), subject('a', 20, 1)], from: '2027-01-11', to: '2027-01-29',
    windows: [1, 2, 3, 4, 5].map(dia => ({ dia, inicio: '13:00', fim: '17:00' })), pauses: [], bookings: [], blocks: [], now: new Date(2026, 10, 22, 12) };
let result = suggestCourseSchedule(base);
assert.equal(result.requiredMinutes, 2000);
assert.equal(result.missingMinutes, 0);
assert.equal(result.sessions[0].disciplinaId, 'a');
assert.equal(result.sessions[0].data, base.from);
assert.deepEqual(validateCourseSessions(base, result.sessions), []);
assert.equal(result.sessions.at(-1).fim, '14:20');
// A partially occupied turn cannot become a short residual suggestion.
const blocked = { ...base, bookings: [{ id: 'legacy', data: base.from, inicio: '13:00', fim: '16:20', descricao: 'Aula legada' },
    { id: 'vacation', data: '2027-01-12', inicio: '00:00', fim: '00:00', descricao: 'Férias', diaInteiro: true }],
    blocks: [{ data: '2027-01-13', descricao: 'Feriado' }] };
result = suggestCourseSchedule(blocked);
assert.equal(result.sessions[0].data, '2027-01-14');
assert.equal(result.missingMinutes, 0);
const missing = suggestCourseSchedule({ ...base, to: base.from });
assert.equal(missing.allocatedMinutes, 240); assert.equal(missing.missingMinutes, 1760);
assert.match(validateCourseSessions(base, missing.sessions).join(), /carga/);
const excluded = suggestCourseSchedule({ ...base, excludedDates: [base.from] });
assert.equal(excluded.sessions[0].data, '2027-01-12');
const sixty = suggestCourseSchedule({ ...base, course: { ...course, tipoHoraMin: '60' } });
assert.equal(sixty.requiredMinutes, 2400); assert.equal(sixty.missingMinutes, 0);
const pause = suggestCourseSchedule({ ...base, windows: [{ dia: 1, inicio: '18:00', fim: '22:00' }], pauses: [{ dia: 1, inicio: '18:00', fim: '19:00' }] });
assert.equal(pause.sessions[0].inicio, '19:00');
const saturday = suggestCourseSchedule({ ...base, windows: [{ dia: 6, inicio: '08:00', fim: '12:00' }] });
assert.equal(saturday.sessions[0].data, '2027-01-16');
assert.throws(() => curriculumMinutes({ ...course, cargaTotalHoras: 41 }, base.subjects), /soma/);
assert.throws(() => curriculumMinutes({ ...course, tipoHoraMin: '45' }, base.subjects), /50 ou 60/);
assert.throws(() => curriculumMinutes(course, [subject('a', .001, 1)]), /inteiros/);
assert.throws(() => curriculumMinutes(course, [{ ...subject('a', 40, 1), tenantId: 'other' }]), /pertencer/);
assert.throws(() => suggestCourseSchedule({ ...base, to: '2027-12-31' }), /180/);
const valid = suggestCourseSchedule(base).sessions;
assert.match(validateCourseSessions(base, [{ ...valid[0], data: '' }, ...valid.slice(1)]).join(), /inválido/);
assert.match(validateCourseSessions(base, [{ ...valid[0], fim: '12:00' }, ...valid.slice(1)]).join(), /inválido/);
assert.match(validateCourseSessions(base, [{ ...valid[0], disciplinaId: 'foreign' }, ...valid.slice(1)]).join(), /pertence/);
assert.match(validateCourseSessions(base, [valid[0], ...valid]).join(), /sobrepostas/);
assert.match(validateCourseSessions(base, [{ ...valid[0], inicio: '12:00' }, ...valid.slice(1)]).join(), /fora/);
// Independent minute accounting over many curricula; do not compare the algorithm to itself.
for (let amount = 1; amount <= 80; amount++) {
    const args = { ...base, course: { ...course, cargaTotalHoras: amount }, subjects: [subject('a', amount / 2, 1), subject('b', amount / 2, 2)], to: '2027-04-30' };
    const proposal = suggestCourseSchedule(args), totals = new Map(), occupied = new Set();
    for (const row of proposal.sessions) {
        const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        for (let minute = toMin(row.inicio); minute < toMin(row.fim); minute++) {
            const key = `${row.data}:${minute}`; assert.equal(occupied.has(key), false); occupied.add(key);
            totals.set(row.disciplinaId, (totals.get(row.disciplinaId) || 0) + 1);
        }
    }
    assert.equal(occupied.size, amount * 50); assert.equal(totals.get('a'), amount * 25); assert.equal(totals.get('b'), amount * 25);
}
console.log('OK: propostas de 40h, horas de 50/60 min, carga exata por disciplina, turnos inteiros, sábado, pausas, férias, bloqueios, ajustes e disponibilidade insuficiente.');
