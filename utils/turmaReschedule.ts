import type { Aula } from '../types';
import { localDateKey } from './turmaChanges';

export interface TurmaDateChange { id: string; nova_data: string }
export function validDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}
export function shiftDateKey(value: string, days: number): string {
    if (!validDateKey(value) || !Number.isInteger(days) || Math.abs(days) > 3660) return '';
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    const result = localDateKey(date);
    return validDateKey(result) ? result : '';
}
export function isHistoricalTurmaLesson(aula: Aula, now = new Date()): boolean {
    const start = new Date(aula.data);
    const [h, m] = aula.horarioInicio.split(':').map(Number);
    start.setHours(h, m, 0, 0);
    return start <= now;
}
export function canRescheduleTurmaLesson(aula: Aula, now = new Date(), includeConcluded = false): boolean {
    if (!(aula.data instanceof Date) || Number.isNaN(aula.data.getTime())) return false;
    const identified = !!(aula.turmaId || (aula.numeroTurma?.trim() && (aula.cursoId || aula.nomeCursoLegado?.trim())));
    const end = new Date(aula.data);
    const [h, m] = aula.horarioFim.split(':').map(Number);
    end.setHours(h, m, 0, 0);
    return identified && (aula.status === 'agendada' || (includeConcluded && aula.status === 'concluida' && end <= now));
}
export function selectTurmaReschedule(aulas: Aula[], dates: Record<string, string>, excluded: string[], now = new Date(), includeConcluded = false) {
    const exclude = new Set(excluded);
    return aulas.filter(a => canRescheduleTurmaLesson(a, now, includeConcluded) && !exclude.has(a.id)
        && Object.hasOwn(dates, localDateKey(a.data)));
}
export function turmaDateChanges(aulas: Aula[], dates: Record<string, string>, now = new Date()): TurmaDateChange[] {
    return aulas.map(a => {
        const original = localDateKey(a.data), next = dates[original];
        if (!validDateKey(next || '') || next === original) throw new Error('Escolha uma nova data para cada dia selecionado.');
        const start = new Date(`${next}T${a.horarioInicio.slice(0, 5)}:00`);
        if (!(start > now)) throw new Error('As novas datas e horários devem estar no futuro.');
        return { id: a.id, nova_data: next };
    });
}
