import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { turmaLessonExpectation } from '../utils/turmaChanges';
import type { TurmaDateChange } from '../utils/turmaReschedule';
import type { TurmaChangePreview, TurmaChangeRow } from './turmaChanges.service';
import type { Aula } from '../types';

export interface TurmaRescheduleRow extends TurmaChangeRow { nova_data: string }
export interface TurmaReschedulePreview extends TurmaChangePreview { snapshot: TurmaRescheduleRow[] }
async function call(changes: TurmaDateChange[], expected: unknown[], apply: boolean, reason: string): Promise<TurmaReschedulePreview> {
    tenantService.getCurrentTenantId();
    if (!await permissionService.checkPermission('EDIT_CLASS', 'ReagendamentoTurma')) throw new Error('Você não tem permissão para reagendar aulas.');
    const { data, error } = await supabase.rpc('reagendar_aulas_turma', { p_changes: changes, p_expected: expected, p_aplicar: apply, p_motivo: reason.trim() });
    if (error) {
        if (['PGRST202', '42883'].includes(error.code)) throw new Error('O reagendamento em lote ainda não está habilitado no banco. Nenhuma aula foi alterada.');
        if (error.code === '23505') throw new Error('Uma reserva impede o reagendamento. Nenhuma aula foi alterada. Atualize a agenda e gere outra prévia.');
        throw new Error(error.message || 'Não foi possível conferir o reagendamento.');
    }
    if (!data || !Array.isArray(data.snapshot) || !Array.isArray(data.conflicts)
        || data.snapshot.some((r: TurmaRescheduleRow) => typeof r.nova_data !== 'string')
        || data.changedCount !== changes.length || typeof data.applied !== 'boolean') {
        throw new Error('Resposta não confirmada. Atualize a agenda antes de tentar novamente.');
    }
    if (apply && !data.applied) throw new Error('O reagendamento foi bloqueado. Atualize a agenda e revise os conflitos em uma nova prévia.');
    return data as TurmaReschedulePreview;
}
export const turmaRescheduleService = {
    preview(aulas: Aula[], changes: TurmaDateChange[], reason = '') {
        const byId = new Map(changes.map(c => [c.id, c.nova_data]));
        return call(changes, aulas.map(a => ({ ...turmaLessonExpectation(a), nova_data: byId.get(a.id) })), false, reason);
    },
    apply(preview: TurmaReschedulePreview) {
        return call(preview.snapshot.map(a => ({ id: a.id, nova_data: a.nova_data })), preview.snapshot, true,
            String(preview.snapshot[0]?.motivo_reagendamento || ''));
    }
};
