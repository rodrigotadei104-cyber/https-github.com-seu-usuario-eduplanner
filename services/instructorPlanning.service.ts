import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { validateRoutine, planningDates } from '../utils/instructorPlanning';
import { validDateKey } from '../utils/turmaReschedule';
import type { RoutineWindow, PlanningBooking, PlanningBlock } from '../utils/instructorPlanning';

export interface InstructorRoutine { janelas: RoutineWindow[]; updated_at: string | null }
export interface InstructorPlanningData {
    routine: InstructorRoutine; bookings: PlanningBooking[]; history: PlanningBooking[]; blocks: PlanningBlock[];
    loadedAt: string; historyFrom: string; historyTo: string; legacyCount: number;
}
const fail = (error: { code?: string; message?: string }) => {
    if (['PGRST202','PGRST205','42883','42P01'].includes(error.code || '')) return new Error('O simulador ainda não está habilitado no banco. Nenhuma aula foi alterada.');
    return new Error(error.message || 'Não foi possível consultar a agenda completa. Tente atualizar a consulta.');
};
function bookings(value: unknown): PlanningBooking[] {
    if (!Array.isArray(value)) throw new Error('Agenda incompleta. Atualize a consulta.');
    return value.map(row => {
        if (!row || typeof row.id !== 'string' || !validDateKey(row.data)) throw new Error('A agenda retornou registros inválidos. Confira o cadastro.');
        return { id: row.id, data: row.data, inicio: String(row.inicio || ''), fim: String(row.fim || ''), descricao: String(row.descricao || 'Compromisso'), diaInteiro: row.diaInteiro === true };
    });
}
function routine(value: unknown): InstructorRoutine {
    if (value === null) return { janelas: [], updated_at: null };
    const row = value as InstructorRoutine;
    if (!row || validateRoutine(row.janelas) || typeof row.updated_at !== 'string') throw new Error('Rotina recebida inválida. Confira o cadastro antes de simular.');
    return { janelas: row.janelas, updated_at: row.updated_at };
}
export const instructorPlanningService = {
    async load(instructorId: string, from: string, to: string): Promise<InstructorPlanningData> {
        tenantService.getCurrentTenantId(); planningDates(from, to);
        const { data, error } = await supabase.rpc('consultar_planejamento_instrutor', { p_instrutor: instructorId, p_inicio: from, p_fim: to });
        if (error) throw fail(error);
        if (!data || typeof data.loaded_at !== 'string' || !Number.isFinite(Date.parse(data.loaded_at)) || !validDateKey(data.history_from) || !validDateKey(data.history_to)
            || !Array.isArray(data.feriados) || !Array.isArray(data.bloqueios)) throw new Error('Consulta incompleta. Atualize a agenda.');
        const blocks = [...data.feriados, ...data.bloqueios];
        if (blocks.some(b => !validDateKey(b?.data) || typeof b?.descricao !== 'string')) throw new Error('Calendário incompleto. Atualize a consulta.');
        return { routine: routine(data.routine), bookings: [...bookings(data.aulas), ...bookings(data.eventos)], history: bookings(data.historico),
            blocks, loadedAt: data.loaded_at, historyFrom: data.history_from, historyTo: data.history_to,
            legacyCount: data.aulas.filter((a: { legacy?: boolean }) => a.legacy === true).length };
    },
    async save(instructorId: string, windows: RoutineWindow[], version: string | null): Promise<InstructorRoutine> {
        tenantService.getCurrentTenantId();
        if (!await permissionService.checkPermission('MANAGE_REGISTRATIONS','RotinaInstrutor')) throw new Error('Você não tem permissão para salvar a rotina da unidade.');
        const errorText = validateRoutine(windows); if (errorText) throw new Error(errorText);
        const { data, error } = await supabase.rpc('salvar_rotina_instrutor', { p_instrutor: instructorId, p_janelas: windows, p_version: version });
        if (error) throw fail(error);
        return routine(data);
    }
};
