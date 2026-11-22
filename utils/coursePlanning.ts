import type { CatalogoCurso, DisciplinaCurso } from '../types';
import type { PlanningBooking, PlanningBlock, RoutineWindow } from './instructorPlanning';
import { planningMinutes, planningTime, planningDates } from './instructorPlanning';
import { computeInstructorTurns } from './instructorTurns';
import { validDateKey } from './turmaReschedule';

export interface CourseSession { data: string; inicio: string; fim: string; disciplinaId: string }
export interface CourseProposal {
    sessions: CourseSession[]; requiredMinutes: number; allocatedMinutes: number; missingMinutes: number;
}
export interface CoursePlanningInput {
    course: CatalogoCurso; subjects: DisciplinaCurso[]; from: string; to: string;
    windows: RoutineWindow[]; pauses: RoutineWindow[]; bookings: PlanningBooking[];
    blocks: PlanningBlock[]; excludedDates?: string[]; now?: Date;
}
// The agenda stores whole minutes. Never silently round a curriculum or truncate its hours.
export function curriculumMinutes(course: CatalogoCurso, subjects: DisciplinaCurso[]) {
    const minutesPerHour = Number(course.tipoHoraMin || 60);
    if (![50, 60].includes(minutesPerHour)) throw new Error('Confira a duração da hora-aula no catálogo (50 ou 60 minutos).');
    if (!subjects.length || new Set(subjects.map(s => s.id)).size !== subjects.length) throw new Error('O curso precisa de disciplinas distintas no catálogo.');
    const ordered = [...subjects].sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.id.localeCompare(b.id));
    const loads = ordered.map(subject => {
        const raw = subject.cargaHoras * minutesPerHour, minutes = Math.round(raw);
        if (subject.cursoId !== course.id || subject.tenantId !== course.tenantId || !Number.isFinite(raw) || minutes < 1 || Math.abs(raw - minutes) > .000001)
            throw new Error('Confira as disciplinas: cada carga deve corresponder a minutos inteiros e pertencer ao curso.');
        return { subject, minutes };
    });
    const required = course.cargaTotalHoras * minutesPerHour;
    if (!Number.isFinite(required) || Math.abs(loads.reduce((n, s) => n + s.minutes, 0) - required) > .000001)
        throw new Error('A soma das disciplinas difere da carga total. Corrija o catálogo antes de planejar.');
    return { loads, minutesPerHour, requiredMinutes: Math.round(required) };
}

export function suggestCourseSchedule(input: CoursePlanningInput): CourseProposal {
    const { loads, requiredMinutes } = curriculumMinutes(input.course, input.subjects);
    const excluded = new Set(input.excludedDates || []);
    const days = computeInstructorTurns({ ...input, simulated: [] });
    const sessions: CourseSession[] = [];
    let subjectIndex = 0, remaining = loads[0].minutes, allocatedMinutes = 0;
    for (const day of days) {
        if (excluded.has(day.data)) continue;
        for (const turn of day.turnos) {
            if (turn.status !== 'disponivel') continue;
            let cursor = planningMinutes(turn.inicio);
            const end = planningMinutes(turn.fim);
            while (cursor < end && subjectIndex < loads.length) {
                const minutes = Math.min(end - cursor, remaining);
                sessions.push({ data: day.data, inicio: planningTime(cursor), fim: planningTime(cursor + minutes), disciplinaId: loads[subjectIndex].subject.id });
                cursor += minutes; remaining -= minutes; allocatedMinutes += minutes;
                if (!remaining && ++subjectIndex < loads.length) remaining = loads[subjectIndex].minutes;
            }
            if (subjectIndex === loads.length) break;
        }
        if (subjectIndex === loads.length) break;
    }
    if (sessions.length > 500) throw new Error('A proposta excede 500 aulas. Reduza os períodos fragmentados antes de planejar.');
    return { sessions, requiredMinutes, allocatedMinutes, missingMinutes: requiredMinutes - allocatedMinutes };
}

export function validateCourseSessions(input: CoursePlanningInput, sessions: CourseSession[]): string[] {
    const { loads } = curriculumMinutes(input.course, input.subjects);
    planningDates(input.from, input.to);
    if (!sessions.length || sessions.length > 500) return ['A proposta deve conter de 1 a 500 aulas.'];
    const errors = new Set<string>(), totals = new Map<string, number>();
    const days = computeInstructorTurns({ ...input, simulated: [] });
    const byDate = new Map(days.map(d => [d.data, d]));
    for (const s of sessions) {
        const start = planningMinutes(s.inicio), end = planningMinutes(s.fim);
        if (!validDateKey(s.data) || s.data < input.from || s.data > input.to || !/^\d{2}:\d{2}$/.test(s.inicio) || !/^\d{2}:\d{2}$/.test(s.fim)
            || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) { errors.add('Há data ou horário inválido na proposta.'); continue; }
        if (!loads.some(l => l.subject.id === s.disciplinaId)) errors.add('Há uma disciplina que não pertence ao curso.');
        totals.set(s.disciplinaId, (totals.get(s.disciplinaId) || 0) + end - start);
        if (input.excludedDates?.includes(s.data) || !byDate.get(s.data)?.turnos.some(t => t.status === 'disponivel' && s.inicio >= t.inicio && s.fim <= t.fim))
            errors.add('Há aula fora dos turnos livres considerados. Atualize ou ajuste a proposta.');
    }
    const sorted = [...sessions].sort((a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));
    for (let i = 1; i < sorted.length; i++) if (sorted[i].data === sorted[i-1].data && sorted[i].inicio < sorted[i-1].fim) errors.add('Há aulas sobrepostas na proposta.');
    for (const l of loads) if (totals.get(l.subject.id) !== l.minutes) errors.add('A carga distribuída deve corresponder à carga de cada disciplina.');
    return [...errors];
}
