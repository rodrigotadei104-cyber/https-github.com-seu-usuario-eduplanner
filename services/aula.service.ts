// ============================================
// AULA SERVICE
// CRUD de aulas com validações obrigatórias
// ============================================

import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { auditService } from './audit.service';

export type AulaStatus = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';

export interface AulaInput {
    data: string;
    horario_inicio: string;
    horario_fim: string;
    instrutor_id: string;
    curso_id: string;
    materia_id: string;
    sala?: string;
    observacoes?: string;
}

export interface AulaUpdateInput extends Partial<AulaInput> {
    status?: AulaStatus;
}

// Interface para informações de conflito de instrutor
export interface ConflictInfo {
    aulaId: string;
    materia: string;
    horarioInicio: string;
    horarioFim: string;
}

export interface ServiceResult {
    success: boolean;
    error?: string;
    warning?: 'INSTRUCTOR_CONFLICT';
    conflicts?: ConflictInfo[];
    data?: unknown;
}

export interface Metrics {
    totalAulas: number;
    totalHoras: number;
    instrutoresAtivos: number;
    aulasPorStatus: Record<AulaStatus, number>;
}

export const aulaService = {
    /**
     * Listar aulas (filtro por tenant automático via RLS)
     */
    async list(filters?: {
        status?: AulaStatus;
        dateFrom?: string;
        dateTo?: string;
        includeRelations?: boolean;
    }): Promise<unknown[]> {
        let query = supabase.from('aulas').select(
            filters?.includeRelations
                ? `*, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor), materia:materias(id, nome)`
                : '*'
        );

        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        if (filters?.dateFrom) {
            query = query.gte('data', filters.dateFrom);
        }

        if (filters?.dateTo) {
            query = query.lte('data', filters.dateTo);
        }

        const { data, error } = await query.order('data', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /**
     * Buscar aula por ID
     */
    async getById(id: string): Promise<unknown | null> {
        const { data, error } = await supabase
            .from('aulas')
            .select(`*, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor), materia:materias(id, nome)`)
            .eq('id', id)
            .single();

        if (error) return null;
        return data;
    },

    /**
     * Verificar conflito de horário do instrutor
     * Retorna lista de aulas conflitantes (sobreposição de horário no mesmo dia)
     */
    async checkInstructorConflict(params: {
        instructorId: string;
        date: string;
        startTime: string;
        endTime: string;
        excludeAulaId?: string;
    }): Promise<{ hasConflict: boolean; conflicts: ConflictInfo[] }> {
        const { instructorId, date, startTime, endTime, excludeAulaId } = params;

        // Buscar aulas do instrutor no mesmo dia (exceto canceladas)
        let query = supabase
            .from('aulas')
            .select('id, horario_inicio, horario_fim, materia:materias(nome)')
            .eq('instrutor_id', instructorId)
            .eq('data', date)
            .neq('status', 'cancelada');

        if (excludeAulaId) {
            query = query.neq('id', excludeAulaId);
        }

        const { data: existingAulas, error } = await query;

        if (error || !existingAulas) {
            return { hasConflict: false, conflicts: [] };
        }

        // Converter horários para minutos para comparação
        const toMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const newStart = toMinutes(startTime);
        const newEnd = toMinutes(endTime);

        const conflicts: ConflictInfo[] = [];

        for (const aula of existingAulas) {
            const aulaStart = toMinutes(aula.horario_inicio);
            const aulaEnd = toMinutes(aula.horario_fim);

            // Verificar sobreposição: (start1 < end2) && (end1 > start2)
            if (newStart < aulaEnd && newEnd > aulaStart) {
                conflicts.push({
                    aulaId: aula.id,
                    materia: (aula.materia as any)?.nome || 'Desconhecida',
                    horarioInicio: aula.horario_inicio,
                    horarioFim: aula.horario_fim
                });
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts
        };
    },

    /**
     * Criar aula (Admin ou Editor)
     * @param forceCreate - Se true, ignora verificação de conflito de instrutor
     */
    async create(input: AulaInput, forceCreate: boolean = false): Promise<ServiceResult> {
        // 1. Validação de permissão
        const canCreate = await permissionService.checkPermission('CREATE_CLASS', 'Aula');
        if (!canCreate) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. Obter tenant do contexto
        const tenantId = tenantService.getCurrentTenantId();

        // 3. Verificar conflito de instrutor (se não forçado)
        if (!forceCreate) {
            const conflictCheck = await this.checkInstructorConflict({
                instructorId: input.instrutor_id,
                date: input.data,
                startTime: input.horario_inicio,
                endTime: input.horario_fim
            });

            if (conflictCheck.hasConflict) {
                // Log de detecção de conflito
                await auditService.log({
                    action: 'UPDATE',
                    entity: 'aula',
                    details: {
                        type: 'CONFLICT_DETECTED',
                        instrutor_id: input.instrutor_id,
                        data: input.data,
                        horario_inicio: input.horario_inicio,
                        horario_fim: input.horario_fim,
                        conflitosEncontrados: conflictCheck.conflicts.length
                    },
                    result: 'success'
                });

                // Retornar warning (não bloquear)
                return {
                    success: false,
                    warning: 'INSTRUCTOR_CONFLICT',
                    conflicts: conflictCheck.conflicts
                };
            }
        } else {
            // Log que usuário ignorou conflito
            await auditService.log({
                action: 'UPDATE',
                entity: 'aula',
                details: {
                    type: 'CONFLICT_OVERRIDDEN',
                    instrutor_id: input.instrutor_id,
                    data: input.data,
                    horario_inicio: input.horario_inicio,
                    horario_fim: input.horario_fim
                },
                result: 'success'
            });
        }

        // 4. Inserção com tenant forçado
        const { data, error } = await supabase
            .from('aulas')
            .insert({
                ...input,
                tenant_id: tenantId,
                status: 'agendada'
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        // 5. Audit log
        await auditService.log({
            action: 'CREATE',
            entity: 'aula',
            entityId: data.id,
            details: { materia_id: input.materia_id, data: input.data },
            result: 'success'
        });

        return { success: true, data };
    },

    /**
     * Atualizar aula (Admin ou Editor, com restrições para cancelamento)
     */
    async update(id: string, input: AulaUpdateInput): Promise<ServiceResult> {
        // 1. Buscar aula atual para validações
        const { data: existing, error: fetchError } = await supabase
            .from('aulas')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return { success: false, error: 'Aula não encontrada.' };
        }

        // 2. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(
            existing.tenant_id,
            'aula',
            id
        );
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 3. CRÍTICO: Cancelamento só por Admin
        if (input.status === 'cancelada') {
            const canCancel = await permissionService.checkPermission('CANCEL_CLASS', `Aula:${id}`);
            if (!canCancel) {
                return { success: false, error: 'Apenas administradores podem cancelar aulas.' };
            }

            // Não pode cancelar aula já concluída
            if (existing.status === 'concluida') {
                await auditService.log({
                    action: 'CANCEL',
                    entity: 'aula',
                    entityId: id,
                    details: { reason: 'Cannot cancel concluded class', blocked: true },
                    result: 'failure'
                });
                return { success: false, error: 'Não é permitido cancelar aula já concluída.' };
            }
        } else {
            // Edição normal: Admin ou Editor
            const canEdit = await permissionService.checkPermission('EDIT_CLASS', `Aula:${id}`);
            if (!canEdit) {
                return { success: false, error: 'Permissão negada.' };
            }
        }

        // 4. Nunca permitir alteração de tenant_id
        const safeInput = { ...input };
        delete (safeInput as Record<string, unknown>).tenant_id;

        // 5. Executar update
        const { data: updated, error: updateError } = await supabase
            .from('aulas')
            .update(safeInput)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        // 6. Audit com tipo apropriado
        const auditAction = input.status === 'cancelada' ? 'CANCEL' :
            input.status && input.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE';

        await auditService.log({
            action: auditAction,
            entity: 'aula',
            entityId: id,
            details: {
                previousStatus: existing.status,
                newStatus: input.status || existing.status,
                changes: Object.keys(safeInput)
            },
            result: 'success'
        });

        return { success: true, data: updated };
    },

    /**
     * Excluir aula fisicamente (SOMENTE Admin)
     */
    async delete(id: string): Promise<ServiceResult> {
        // 1. Validar permissão
        const canDelete = await permissionService.checkPermission('DELETE_CLASS', `Aula:${id}`);
        if (!canDelete) {
            return { success: false, error: 'Permissão negada. Apenas administradores podem excluir aulas.' };
        }

        // 2. Buscar aula para validação de tenant
        const { data: existing, error: fetchError } = await supabase
            .from('aulas')
            .select('tenant_id')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return { success: false, error: 'Aula não encontrada.' };
        }

        // 3. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'aula', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 4. Executar DELETE
        const { error: deleteError } = await supabase
            .from('aulas')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return { success: false, error: deleteError.message };
        }

        // 5. Audit log
        await auditService.log({
            action: 'DELETE',
            entity: 'aula',
            entityId: id,
            details: { type: 'PHYSICAL_DELETION' },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Métricas (EXCLUI aulas canceladas das métricas principais)
     */
    async getMetrics(): Promise<Metrics> {
        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('status, horario_inicio, horario_fim, instrutor_id');

        if (error) throw error;

        const instructors = new Set<string>();
        let totalMinutes = 0;
        let activeCount = 0;
        const statusCounts: Record<AulaStatus, number> = {
            agendada: 0,
            em_andamento: 0,
            concluida: 0,
            cancelada: 0
        };

        for (const aula of aulas || []) {
            const status = aula.status as AulaStatus;
            statusCounts[status]++;

            // CRÍTICO: Canceladas NÃO contam para métricas principais
            if (status !== 'cancelada') {
                instructors.add(aula.instrutor_id);
                activeCount++;

                // Calcular duração
                const [startH, startM] = aula.horario_inicio.split(':').map(Number);
                const [endH, endM] = aula.horario_fim.split(':').map(Number);
                const duration = (endH * 60 + endM) - (startH * 60 + startM);
                if (duration > 0) {
                    totalMinutes += duration;
                }
            }
        }

        return {
            totalAulas: activeCount,
            totalHoras: Math.round(totalMinutes / 60),
            instrutoresAtivos: instructors.size,
            aulasPorStatus: statusCounts
        };
    }
};
