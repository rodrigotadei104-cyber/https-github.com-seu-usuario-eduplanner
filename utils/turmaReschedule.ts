import type { Aula } from '../types';
import { canChangeTurmaLesson, localDateKey } from './turmaChanges';

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
export function selectTurmaReschedule(aulas: Aula[], dates: Record<string, string>, excluded: string[], now = new Date()) {
    const exclude = new Set(excluded);
    return aulas.filter(a => canChangeTurmaLesson(a, now) && !exclude.has(a.id)
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
