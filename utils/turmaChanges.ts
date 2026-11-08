import type { Aula } from '../types';

export type TurmaChangeKind = 'instrutor' | 'sala';
export const localDateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function canChangeTurmaLesson(aula: Aula, now = new Date()): boolean {
    if (aula.status !== 'agendada' || !(aula.data instanceof Date) || Number.isNaN(aula.data.getTime())) return false;
    const start = new Date(aula.data);
    const [hour, minute] = aula.horarioInicio.split(':').map(Number);
    start.setHours(hour, minute, 0, 0);
    return start > now && !!(aula.turmaId || (aula.numeroTurma && aula.cursoId));
}

export function turmaResource(aula: Aula, kind: TurmaChangeKind): string {
    return kind === 'instrutor' ? aula.instrutorId || '' : aula.sala || '';
}

export function selectTurmaChanges(aulas: Aula[], kind: TurmaChangeKind, source: string,
    target: string, dates: string[], excludedIds: string[], now = new Date()): Aula[] {
    const dateSet = new Set(dates), excluded = new Set(excludedIds);
    return aulas.filter(a => canChangeTurmaLesson(a, now)
        && dateSet.has(localDateKey(a.data)) && !excluded.has(a.id)
        && (source === '__all__' || turmaResource(a, kind) === source)
        && turmaResource(a, kind) !== target);
}

// Campos normalizados também no banco: uma prévia antiga não pode sobrescrever mudanças recentes.
export function turmaLessonExpectation(aula: Aula): Record<string, unknown> {
    return {
        id: aula.id, tenant_id: aula.tenantId, turma_id: aula.turmaId || null,
        curso_id: aula.cursoId || null, materia_id: aula.materiaId || null,
        instrutor_id: aula.instrutorId || null, sala: aula.sala || '',
        data: localDateKey(aula.data), horario_inicio: aula.horarioInicio.slice(0, 5),
        horario_fim: aula.horarioFim.slice(0, 5), status: aula.status
    };
}
