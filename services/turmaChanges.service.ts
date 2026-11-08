import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { turmaLessonExpectation } from '../utils/turmaChanges';
import type { TurmaChangeKind } from '../utils/turmaChanges';
import type { Aula } from '../types';

export interface TurmaChangeConflict {
    id: string; data: string; inicio: string; fim: string; descricao: string;
}
export interface TurmaChangeRow {
    id: string; data: string; horario_inicio: string; horario_fim: string;
    instrutor_id: string | null; sala: string; materia_id: string | null;
    disciplina_id?: string | null; [key: string]: unknown;
}
export interface TurmaChangePreview {
    snapshot: TurmaChangeRow[];
    conflicts: TurmaChangeConflict[];
    changedCount: number;
    applied: boolean;
}

async function callChange(kind: TurmaChangeKind, target: string, ids: string[], expected: unknown[], apply: boolean): Promise<TurmaChangePreview> {
    tenantService.getCurrentTenantId();
    if (!await permissionService.checkPermission('EDIT_CLASS', 'AlteracaoTurma')) throw new Error('Você não tem permissão para alterar aulas.');
    const { data, error } = await supabase.rpc('alterar_recursos_turma', {
        p_ids: ids, p_tipo: kind, p_destino: target.trim(), p_expected: expected, p_aplicar: apply
    });
    if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') {
            throw new Error('A alteração por turma ainda não está habilitada no banco. As aulas não foram alteradas.');
        }
        if (error.code === '23505') {
            throw new Error('Existe uma reserva que impede esta troca. Nenhuma aula foi alterada. Atualize a agenda e revise a seleção.');
        }
        throw new Error(error.message || 'Não foi possível validar a alteração.');
    }
    if (!data || !Array.isArray(data.snapshot) || !Array.isArray(data.conflicts)
        || typeof data.changedCount !== 'number' || typeof data.applied !== 'boolean') {
        throw new Error('Não foi possível confirmar a resposta. Atualize a agenda antes de tentar novamente.');
    }
    if (apply && (!data.applied || data.changedCount !== ids.length)) {
        throw new Error('A alteração não foi confirmada. Atualize a agenda e gere uma nova prévia.');
    }
    return data as TurmaChangePreview;
}

export const turmaChangesService = {
    preview(aulas: Aula[], kind: TurmaChangeKind, target: string) {
        return callChange(kind, target, aulas.map(a => a.id), aulas.map(turmaLessonExpectation), false);
    },
    apply(preview: TurmaChangePreview, kind: TurmaChangeKind, target: string) {
        return callChange(kind, target, preview.snapshot.map(a => a.id), preview.snapshot, true);
    }
};
