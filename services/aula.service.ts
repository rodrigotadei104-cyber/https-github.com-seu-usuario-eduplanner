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
    warning?: 'INSTRUCTOR_CONFLICT' | 'ROOM_CONFLICT';
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
                ? `*, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor, minutos_por_hora), materia:materias(id, nome)`
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
     * Verificar conflito de sala
     * Retorna lista de aulas conflitantes na mesma sala
     */
    async checkRoomConflict(params: {
        sala: string;
        date: string;
        startTime: string;
        endTime: string;
        excludeAulaId?: string;
    }): Promise<{ hasConflict: boolean; conflicts: ConflictInfo[] }> {
        const { sala, date, startTime, endTime, excludeAulaId } = params;

        if (!sala) return { hasConflict: false, conflicts: [] };

        // Buscar aulas na mesma sala no mesmo dia (exceto canceladas)
        let query = supabase
            .from('aulas')
            .select('id, horario_inicio, horario_fim, materia:materias(nome), instrutor:instrutores(nome)')
            .eq('sala', sala)
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

            // 3.1. Verificar conflito de sala (se instrutor estiver ok)
            if (input.sala) {
                const roomConflict = await this.checkRoomConflict({
                    sala: input.sala,
                    date: input.data,
                    startTime: input.horario_inicio,
                    endTime: input.horario_fim
                });

                if (roomConflict.hasConflict) {
                    await auditService.log({
                        action: 'UPDATE',
                        entity: 'aula',
                        details: {
                            type: 'ROOM_CONFLICT_DETECTED',
                            sala: input.sala,
                            data: input.data
                        },
                        result: 'success'
                    });

                    return {
                        success: false,
                        warning: 'ROOM_CONFLICT',
                        conflicts: roomConflict.conflicts
                    };
                }
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
    async update(id: string, input: AulaUpdateInput, forceUpdate: boolean = false): Promise<ServiceResult> {
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

        // 3.5. Verificar conflito de instrutor (se não forçado)
        // Só verifica se a aula enviada é ativa (não cancelada/concluída) ou se o status original era ativo
        const targetStatus = input.status || existing.status;
        if (!forceUpdate && targetStatus !== 'cancelada' && targetStatus !== 'concluida') {
            const checkData = {
                instructorId: (input as any).instrutor_id || existing.instrutor_id,
                date: input.data || existing.data,
                startTime: input.horario_inicio || existing.horario_inicio,
                endTime: input.horario_fim || existing.horario_fim,
                excludeAulaId: id
            };

            const conflictCheck = await this.checkInstructorConflict(checkData);

            if (conflictCheck.hasConflict) {
                await auditService.log({
                    action: 'UPDATE',
                    entity: 'aula',
                    entityId: id,
                    details: {
                        type: 'CONFLICT_DETECTED',
                        data: checkData,
                        conflitos: conflictCheck.conflicts.length
                    },
                    result: 'success'
                });

                return {
                    success: false,
                    warning: 'INSTRUCTOR_CONFLICT',
                    conflicts: conflictCheck.conflicts
                };
            }

            // 3.6. Verificar conflito de sala
            const targetSala = input.sala || existing.sala;
            if (targetSala) {
                const roomConflict = await this.checkRoomConflict({
                    sala: targetSala,
                    date: checkData.date,
                    startTime: checkData.startTime,
                    endTime: checkData.endTime,
                    excludeAulaId: id
                });

                if (roomConflict.hasConflict) {
                    await auditService.log({
                        action: 'UPDATE',
                        entity: 'aula',
                        entityId: id,
                        details: {
                            type: 'ROOM_CONFLICT_DETECTED',
                            sala: targetSala,
                            data: checkData
                        },
                        result: 'success'
                    });

                    return {
                        success: false,
                        warning: 'ROOM_CONFLICT',
                        conflicts: roomConflict.conflicts
                    };
                }
            }
        } else if (forceUpdate) {
            await auditService.log({
                action: 'UPDATE',
                entity: 'aula',
                entityId: id,
                details: { type: 'CONFLICT_OVERRIDDEN' },
                result: 'success'
            });
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
     * Pode filtrar por período opcional.
     */
    async getMetrics(period?: { start: string; end: string }): Promise<Metrics> {
        // Fetch course info to know minutes_per_hour
        let query = supabase
            .from('aulas')
            .select('status, horario_inicio, horario_fim, instrutor_id, curso:cursos(minutos_por_hora)');

        if (period) {
            query = query.gte('data', period.start).lte('data', period.end);
        }

        const { data: aulas, error } = await query;

        if (error) throw error;

        const instructors = new Set<string>();
        let totalLegalHours = 0; // Changed from totalMinutes to totalLegalHours accumulator
        let activeCount = 0;
        const statusCounts: Record<AulaStatus, number> = {
            agendada: 0,
            em_andamento: 0,
            concluida: 0,
            cancelada: 0
        };

        for (const aula of aulas || []) {
            const status = aula.status as AulaStatus;

            // Incrementa contagem de status (seguro mesmo se não existir no objeto inicial, mas já inicializamos)
            if (statusCounts[status] !== undefined) {
                statusCounts[status]++;
            }

            // CRÍTICO: Canceladas NÃO contam para métricas principais (Total, Horas, Instrutores)
            if (status !== 'cancelada') {
                instructors.add(aula.instrutor_id);
                activeCount++;

                // Calcular duração em LEGAL HOURS
                const [startH, startM] = aula.horario_inicio.split(':').map(Number);
                const [endH, endM] = aula.horario_fim.split(':').map(Number);
                const rawDurationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

                if (rawDurationMinutes > 0) {
                    // Default to 60 if relations are missing or null
                    const minutesPerHour = (aula.curso as any)?.minutos_por_hora || 60;
                    totalLegalHours += (rawDurationMinutes / minutesPerHour);
                }
            }
        }

        return {
            totalAulas: activeCount,
            totalHoras: Math.round(totalLegalHours), // Now summing pre-calculated hours
            instrutoresAtivos: instructors.size,
            aulasPorStatus: statusCounts
        };
    },

    /**
     * Sincronizar status das aulas baseado no horário atual
     * Agendada -> Em Andamento -> Concluída
     * Não afeta aulas canceladas
     */
    async syncClassStatuses(): Promise<void> {
        const now = new Date();
        // create local YYYY-MM-DD string
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Buscar aulas não finalizadas (agendada ou em_andamento)
        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('*')
            .neq('status', 'cancelada')
            .neq('status', 'concluida')
            .lte('data', todayStr);

        if (error || !aulas) return;

        const updates: any[] = [];
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

        // Helper para converter HH:mm em minutos
        const toMinutes = (time: string) => {
            if (!time) return 0;
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        for (const aula of aulas) {
            let newStatus: AulaStatus | null = null;
            const isPastDay = aula.data < todayStr;
            const isToday = aula.data === todayStr;

            const startMinutes = toMinutes(aula.horario_inicio);
            const endMinutes = toMinutes(aula.horario_fim);

            if (isPastDay) {
                // Se é dia passado e não está cancelada/concluída, deve finalizar
                newStatus = 'concluida';
            } else if (isToday) {
                if (currentTimeMinutes >= endMinutes) {
                    newStatus = 'concluida';
                } else if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
                    newStatus = 'em_andamento';
                }
            }

            // Só atualiza se o status for mudar
            if (newStatus && newStatus !== aula.status) {
                updates.push(
                    supabase
                        .from('aulas')
                        .update({ status: newStatus })
                        .eq('id', aula.id)
                        .then(async ({ error }) => {
                            if (!error) {
                                await auditService.log({
                                    action: 'STATUS_CHANGE',
                                    entity: 'aula',
                                    entityId: aula.id,
                                    details: {
                                        previousStatus: aula.status,
                                        newStatus: newStatus,
                                        reason: 'auto_sync'
                                    },
                                    result: 'success'
                                });
                            }
                        })
                );
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);
        }
    },

    /**
     * Relatório Mensal Comparativo de Instrutores
     * Agrupa aulas por mês e instrutor para o ano selecionado.
     * Exclui canceladas.
     */
    async getInstructorMonthlyReport(year: number): Promise<{
        months: string[];
        data: { instructorName: string; values: number[]; total: number }[];
    }> {
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('data, instrutor:instrutores(nome), status')
            .gte('data', startOfYear)
            .lte('data', endOfYear)
            .neq('status', 'cancelada');

        if (error) throw error;

        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const instructorMap = new Map<string, number[]>();

        aulas?.forEach((aula: any) => {
            const nome = aula.instrutor?.nome || 'Desconhecido';
            if (!instructorMap.has(nome)) {
                instructorMap.set(nome, Array(12).fill(0));
            }

            let monthIndex = -1;

            if (aula.data && aula.data.length >= 7) {
                const monthStr = aula.data.substring(5, 7);
                const parsed = parseInt(monthStr, 10);
                if (!isNaN(parsed)) {
                    monthIndex = parsed - 1;
                }
            }

            if (monthIndex >= 0 && monthIndex <= 11) {
                const currentCounts = instructorMap.get(nome)!;
                currentCounts[monthIndex]++;
            }
        });

        const resultData = Array.from(instructorMap.entries()).map(([name, values]) => {
            const total = values.reduce((acc, curr) => acc + curr, 0);
            return {
                instructorName: name,
                values,
                total
            };
        });

        resultData.sort((a, b) => b.total - a.total);

        return {
            months,
            data: resultData
        };
    },

    /**
     * Histórico Mensal de Aulas e Horas
     */
    async getMonthlyHistory(date: Date): Promise<{ totalClasses: number; totalHours: number; completed: number }[]> {
        const year = date.getFullYear();
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('data, status, horario_inicio, horario_fim, curso:cursos(minutos_por_hora)')
            .gte('data', startOfYear)
            .lte('data', endOfYear)
            .neq('status', 'cancelada');

        if (error) throw error;

        const historyMap = new Map<string, { totalClasses: number; totalHours: number; completed: number }>();

        for (let i = 0; i < 12; i++) {
            const d = new Date(year, i, 1);
            const monthKey = d.toISOString().slice(0, 7);
            historyMap.set(monthKey, { totalClasses: 0, totalHours: 0, completed: 0 });
        }

        aulas?.forEach(aula => {
            const monthKey = aula.data.slice(0, 7);
            if (historyMap.has(monthKey)) {
                const entry = historyMap.get(monthKey)!;
                entry.totalClasses++;

                if (aula.status === 'concluida') {
                    entry.completed++;
                }

                const [startH, startM] = aula.horario_inicio.split(':').map(Number);
                const [endH, endM] = aula.horario_fim.split(':').map(Number);
                const rawMinutes = (endH * 60 + endM) - (startH * 60 + startM);

                if (rawMinutes > 0) {
                    const minutesPerHour = (aula.curso as any)?.minutos_por_hora || 60;
                    entry.totalHours += (rawMinutes / minutesPerHour);
                }
            }
        });

        return Array.from(historyMap.values());
    },

    async getAnnualProjection(history: { totalHours: number }[]): Promise<{ projectedTotal: number; averageMonthly: number }> {
        const currentMonthIndex = new Date().getMonth();
        // Use data up to current month (inclusive or exclusive? exclusive to be safe as current month is partial)
        // But logic is usually "average of passed months * 12"
        // If no data, return 0.
        const passedMonths = history.slice(0, currentMonthIndex + 1);
        const totalSoFar = passedMonths.reduce((sum, item) => sum + item.totalHours, 0);
        const average = currentMonthIndex >= 0 ? totalSoFar / (currentMonthIndex + 1) : 0;

        return {
            projectedTotal: Math.round(average * 12),
            averageMonthly: average
        };
    },

    async getGrowthTrend(history: { totalClasses: number }[]): Promise<{ growthRate: number; isPositive: boolean }> {
        const currentMonthIndex = new Date().getMonth();
        if (currentMonthIndex === 0) return { growthRate: 0, isPositive: true };

        const current = history[currentMonthIndex].totalClasses;
        const previous = history[currentMonthIndex - 1].totalClasses;

        if (previous === 0) return { growthRate: current > 0 ? 100 : 0, isPositive: true };

        const change = current - previous;
        const rate = (change / previous) * 100;

        return {
            growthRate: Math.abs(Math.round(rate)),
            isPositive: rate >= 0,
            currentMonth: current,
            previousMonth: previous
        };
    }
};
