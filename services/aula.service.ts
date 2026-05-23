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
    instrutor_id?: string;
    curso_id?: string;
    materia_id?: string;
    sala?: string;
    observacoes?: string;
    numero_turma?: string; // Identifier for the specific cohort (e.g. T01-2026)
    disciplina_id?: string; // Nova Arquitetura
    turma_id?: string; // Nova Arquitetura
    auto_gerada?: boolean; // Nova Arquitetura
    tipo_aula?: string; // NORMAL ou PROGRAMA
    origem?: string;
    contabiliza_carga?: boolean;
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
     * Função utilitária para buscar todos os registros paginados do Supabase contornando o limite de 1000 rows
     */
    async _fetchPaginated(queryFactory: (start: number, limit: number) => any): Promise<any[]> {
        let allData: any[] = [];
        const limit = 1000;
        let start = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await queryFactory(start, limit);
            if (error) throw error;
            
            const pageData = data || [];
            allData = [...allData, ...pageData];

            if (pageData.length < limit) {
                hasMore = false;
            } else {
                start += limit;
            }
        }
        return allData;
    },

    /**
     * Listar aulas (filtro por tenant automático via RLS)
     */
    async list(filters?: {
        status?: AulaStatus;
        dateFrom?: string;
        dateTo?: string;
        includeRelations?: boolean;
    }): Promise<unknown[]> {
        return this._fetchPaginated((start, limit) => {
            let query = supabase.from('aulas').select(
                filters?.includeRelations
                    ? `*, 
                       numero_turma, 
                       carga_horaria_materia, 
                       tipo_aula,
                       origem,
                       contabiliza_carga,
                       instrutor:instrutores(id, nome), 
                       curso:cursos(id, nome, cor, minutos_por_hora, numero_curso), 
                       materia:materias(id, nome, carga_horaria),
                       disciplina:disciplinas_curso(id, nome_disciplina, curso:catalogo_cursos(id, nome_curso))`
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

            return query.order('data', { ascending: true })
                        .range(start, start + limit - 1);
        });
    },

    /**
     * Buscar aula por ID
     */
    async getById(id: string): Promise<unknown | null> {
        const { data, error } = await supabase
            .from('aulas')
            .select(`*, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor, numero_curso), materia:materias(id, nome)`)
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

        if (!instructorId) return { hasConflict: false, conflicts: [] };

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

        // 2.1. VALIDAÇÃO DE INTEGRIDADE ACADÊMICA (Curso x Matéria)
        // Buscar informações do Curso e Matéria para garantir consistência
        const { data: curso } = await supabase
            .from('cursos')
            .select('id, numero_curso, minutos_por_hora')
            .eq('id', input.curso_id)
            .single();

        if (!curso) return { success: false, error: 'Curso inválido.' };

        const { data: materia } = await supabase
            .from('materias')
            .select('id, curso_id')
            .eq('id', input.materia_id)
            .single();

        if (!materia) return { success: false, error: 'Matéria inválida.' };

        // REGRA DE OURO: Matéria deve pertencer ao Curso
        if (materia.curso_id !== input.curso_id) {
            await auditService.log({
                action: 'UNAUTHORIZED_ACCESS', // Using specific action or UPDATE/CREATE failure
                entity: 'aula',
                details: {
                    reason: 'ACADEMIC_INCONSISTENCY',
                    curso_id: input.curso_id,
                    materia_curso_id: materia.curso_id
                },
                result: 'failure'
            });
            return { success: false, error: 'Inconsistência Acadêmica: A matéria selecionada não pertence ao curso informado.' };
        }

        // 3. Verificar conflito de instrutor (se não forçado)
        if (!forceCreate) {
            // 3.0. Validar status ativo sem instrutor (embora create force 'agendada', bom garantir se algo mudar)
            // Se status for passado e for diferente de agendada... (mas aqui forçamos agendada na linha 367)
            // Então só precisamos checar se o instrutor está presente caso tivéssemos flexibilidade.
            // Como create força 'agendada', a validação aqui é redundante mas deixamos pronta.
            if (['em_andamento', 'concluida'].includes((input as any).status) && !input.instrutor_id) {
                return { success: false, error: 'Instrutor obrigatório para iniciar ou concluir aula.' };
            }
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

        // 3.7. CALCULAR CARGA HORÁRIA (Horas Aula) AUTOMATICAMENTE
        const [h1, m1] = input.horario_inicio.split(':').map(Number);
        const [h2, m2] = input.horario_fim.split(':').map(Number);
        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        const computedCargaHoraria = totalMinutes > 0
            ? Math.round((totalMinutes / (curso.minutos_por_hora || 60)) * 100) / 100
            : 0;

        // 4. Inserção com tenant forçado e carga horária calculada
        const { data, error } = await supabase
            .from('aulas')
            .insert({
                ...input,
                tenant_id: tenantId,
                status: 'agendada',
                carga_horaria_materia: (input as any).carga_horaria_materia || computedCargaHoraria,
                numero_turma: input.numero_turma // Save cohort ID to the class itself
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        // 5. Audit log (ENHANCED with numero_curso)
        await auditService.log({
            action: 'CREATE',
            entity: 'aula',
            entityId: data.id,
            details: {
                materia_id: input.materia_id,
                data: input.data,
                curso_id: input.curso_id,
                numero_curso: curso.numero_curso || 'N/A' // LOGGING REQUIREMENT
            },
            result: 'success'
        });

        // 6. Check Course Completion
        await this.checkCourseCompletion(input.curso_id);

        return { success: true, data };
    },

    /**
     * Criar aula do tipo PROGRAMA (sem validação de integridade acadêmica curso/matéria)
     */
    async createPrograma(input: AulaInput, forceCreate: boolean = false): Promise<ServiceResult> {
        const canCreate = await permissionService.checkPermission('CREATE_CLASS', 'Aula');
        if (!canCreate) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        if (!forceCreate) {
            const conflictCheck = await this.checkInstructorConflict({
                instructorId: input.instrutor_id || '',
                date: input.data,
                startTime: input.horario_inicio,
                endTime: input.horario_fim
            });

            if (conflictCheck.hasConflict) {
                return {
                    success: false,
                    warning: 'INSTRUCTOR_CONFLICT',
                    conflicts: conflictCheck.conflicts
                };
            }

            if (input.sala) {
                const roomConflict = await this.checkRoomConflict({
                    sala: input.sala,
                    date: input.data,
                    startTime: input.horario_inicio,
                    endTime: input.horario_fim
                });

                if (roomConflict.hasConflict) {
                    return {
                        success: false,
                        warning: 'ROOM_CONFLICT',
                        conflicts: roomConflict.conflicts
                    };
                }
            }
        }

        const [h1, m1] = input.horario_inicio.split(':').map(Number);
        const [h2, m2] = input.horario_fim.split(':').map(Number);
        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        const computedCargaHoraria = totalMinutes > 0 ? Math.round((totalMinutes / 60) * 100) / 100 : 0;

        const { data, error } = await supabase
            .from('aulas')
            .insert({
                ...input,
                tenant_id: tenantId,
                status: 'agendada',
                tipo_aula: 'PROGRAMA',
                origem: input.origem || 'PROGRAMA_INSTITUCIONAL',
                contabiliza_carga: input.contabiliza_carga !== false,
                carga_horaria_materia: (input as any).carga_horaria_materia || computedCargaHoraria,
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'aula',
            entityId: data.id,
            details: {
                tipo: 'PROGRAMA',
                origem: input.origem,
                data: input.data
            },
            result: 'success'
        });

        return { success: true, data };
    },

    /**
     * NOVA ARQUITETURA: Salvar Grade Automática em Lote
     * Recebe as aulas processadas pelo Motor de Geração e salva tudo otimizadamente.
     */
    async salvarGradeAutomatica(aulasGeradas: Omit<import('../types').Aula, 'id'>[]): Promise<ServiceResult> {
        const canCreate = await permissionService.checkPermission('CREATE_CLASS', 'Aula');
        if (!canCreate) {
            return { success: false, error: 'Permissão negada. Apenas Administradores e Editores podem gerar turmas.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        // Converter payload do frontend (camelCase) para o banco de dados (snake_case)
        const payloadDB = aulasGeradas.map(aula => ({
            tenant_id: tenantId,
            data: (aula.data instanceof Date ? aula.data : new Date(aula.data)).toISOString().split('T')[0],
            horario_inicio: aula.horarioInicio,
            horario_fim: aula.horarioFim,
            disciplina_id: aula.disciplinaId,
            numero_turma: (aula as any).numeroTurma || null,
            turma_id: (aula as any).turmaId || null,
            sala: aula.sala || null,
            instrutor_id: aula.instrutor || null,
            status: aula.status,
            auto_gerada: aula.autoGerada || false,
            carga_horaria_materia: aula.cargaHorariaMateria
        }));

        const { data, error } = await supabase
            .from('aulas')
            .insert(payloadDB)
            .select();

        if (error) {
            return { success: false, error: error.message };
        }

        // Auditoria em Lote (Para não floodar os logs com 300 inserções)
        await auditService.log({
            action: 'CREATE',
            entity: 'turma_agenda',
            details: {
                loteSize: aulasGeradas.length,
                turmaId: aulasGeradas[0]?.turmaId,
                fonte: 'ScheduleEngine'
            },
            result: 'success'
        });

        return { success: true, data };
    },

    /**
     * Atualizar aula (Admin ou Editor, com restrições para cancelamento)
     */
    async update(id: string, input: AulaUpdateInput, forceUpdate: boolean = false, propagateRoom: boolean = false): Promise<ServiceResult> {
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

        // 3.1. CRÍTICO: Validar Instrutor para Status Ativo
        const nextStatus = input.status || existing.status;
        const nextInstrutor = (input as any).instrutor_id !== undefined ? (input as any).instrutor_id : existing.instrutor_id;

        if (['em_andamento', 'concluida'].includes(nextStatus)) {
            if (!nextInstrutor) {
                return { success: false, error: 'Instrutor obrigatório para iniciar ou concluir aula.' };
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

        // 4.1. Recalcular Carga Horária se necessário
        let cargaHorariaCalculada = existing.carga_horaria_materia;
        if (input.horario_inicio || input.horario_fim || input.curso_id) {
            const hStart = input.horario_inicio || existing.horario_inicio;
            const hEnd = input.horario_fim || existing.horario_fim;
            const targetCursoId = input.curso_id || existing.curso_id;

            // Buscar minutos_por_hora do curso alvo
            const { data: targetCurso } = await supabase
                .from('cursos')
                .select('minutos_por_hora')
                .eq('id', targetCursoId)
                .single();

            const [h1, m1] = hStart.split(':').map(Number);
            const [h2, m2] = hEnd.split(':').map(Number);
            const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);

            if (totalMinutes > 0) {
                cargaHorariaCalculada = Math.round((totalMinutes / (targetCurso?.minutos_por_hora || 60)) * 100) / 100;
            }
        }

        // 5. Executar update com carga horária persistida
        const { data: updated, error: updateError } = await supabase
            .from('aulas')
            .update({
                ...safeInput,
                carga_horaria_materia: (input as any).carga_horaria_materia || cargaHorariaCalculada
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        // --- PROPAGAÇÃO DE SALA EM LOTE ---
        if (propagateRoom && input.sala && input.sala !== existing.sala) {
            try {
                // Buscar todas as aulas do mesmo curso e turma (cohort) que possuem a SALA ANTIGA
                // Limitamos ao mesmo curso e turma para evitar efeitos colaterais indesejados
                let query = supabase
                    .from('aulas')
                    .select('id')
                    .eq('curso_id', existing.curso_id)
                    .eq('numero_turma', existing.numero_turma)
                    .neq('id', id); // Excluir a aula que já acabamos de atualizar

                if (existing.sala) {
                    query = query.eq('sala', existing.sala);
                } else {
                    query = query.is('sala', null);
                }

                const { data: relatedAulas } = await query;

                if (relatedAulas && relatedAulas.length > 0) {
                    const idsToUpdate = relatedAulas.map(a => a.id);
                    await supabase
                        .from('aulas')
                        .update({ sala: input.sala })
                        .in('id', idsToUpdate);

                    await auditService.log({
                        action: 'UPDATE',
                        entity: 'aula',
                        entityId: id,
                        details: {
                            type: 'ROOM_PROPAGATION',
                            newRoom: input.sala,
                            affectedCount: idsToUpdate.length,
                            cohort: existing.numero_turma
                        },
                        result: 'success'
                    });
                }
            } catch (err) {
                console.error('Erro na propagação de sala:', err);
                // Não falhamos a operação principal por erro na propagação
            }
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

        // 7. Check Course Completion
        if (existing.curso_id) {
            await this.checkCourseCompletion(existing.curso_id);
        }

        return { success: true, data: updated };
    },

    /**
     * Verificar e atualizar conclusão de curso
     */
    async checkCourseCompletion(courseId: string): Promise<void> {
        try {
            // 1. Get Course Info
            const { data: curso } = await supabase
                .from('cursos')
                .select('carga_horaria, minutos_por_hora, status')
                .eq('id', courseId)
                .single();

            if (!curso || !curso.carga_horaria) return;

            // 2. Get all valid classes
            const { data: aulas } = await supabase
                .from('aulas')
                .select('horario_inicio, horario_fim')
                .eq('curso_id', courseId)
                .neq('status', 'cancelada');

            // 3. Calc Total Hours
            let totalMinutes = 0;
            const minutesPerHour = curso.minutos_por_hora || 60;

            aulas?.forEach(a => {
                const [h1, m1] = a.horario_inicio.split(':').map(Number);
                const [h2, m2] = a.horario_fim.split(':').map(Number);
                totalMinutes += (h2 * 60 + m2) - (h1 * 60 + m1);
            });

            const totalHours = totalMinutes / minutesPerHour;

            // 4. Update Status if needed
            // Only update active -> concluido. (Requirement: "Um curso deve ser automaticamente marcado como Concluído")
            if (totalHours >= curso.carga_horaria && curso.status !== 'concluido') {
                await supabase
                    .from('cursos')
                    .update({ status: 'concluido' })
                    .eq('id', courseId);

                await auditService.log({
                    action: 'UPDATE',
                    entity: 'curso',
                    entityId: courseId,
                    details: {
                        type: 'AUTO_COMPLETION',
                        totalHours: Math.round(totalHours * 100) / 100,
                        target: curso.carga_horaria
                    },
                    result: 'success'
                });
            }
        } catch (error) {
            console.error('Error checking course completion:', error);
        }
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
     * Excluir aula tipo PROGRAMA (Admin + Editor)
     * Permite que Editores removam instrutores na aba Jovem Aprendiz.
     * Valida que a aula é realmente do tipo PROGRAMA para evitar escalação de privilégio.
     */
    async deleteAulaPrograma(id: string): Promise<ServiceResult> {
        // 1. Permissão: usa CREATE_CLASS (admin + editor), não DELETE_CLASS (admin only)
        const canManage = await permissionService.checkPermission('CREATE_CLASS', `AulaPrograma:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. Buscar aula e validar que é tipo PROGRAMA
        const { data: existing, error: fetchError } = await supabase
            .from('aulas')
            .select('tenant_id, tipo_aula')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return { success: false, error: 'Aula não encontrada.' };
        }

        if (existing.tipo_aula !== 'PROGRAMA') {
            return { success: false, error: 'Apenas aulas do tipo PROGRAMA podem ser removidas por este método.' };
        }

        // 3. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'aula_programa', id);
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
            entity: 'aula_programa',
            entityId: id,
            details: { type: 'PROGRAMA_DELETION', source: 'JovemAprendiz' },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Excluir todas as aulas de uma turma em lote (Admin apenas)
     * Deleta apenas as aulas futuras/agendadas da turma informada
     */
    async deleteAulasTurma(cursoId: string, numeroTurma: string, turmaId?: string, cursoNome?: string): Promise<ServiceResult> {
        // Validação preventiva contra UUIDs nulos ou strings inválidas (apenas se não houver turmaId e cursoNome)
        if (!turmaId && (!cursoId || cursoId === 'null' || cursoId === 'undefined') && (!cursoNome || cursoNome.trim() === '')) {
            return { success: false, error: 'Esta aula não possui um curso regular associado (ex: programas Jovem Aprendiz não possuem grade regular de aulas para exclusão em lote).' };
        }

        const canDelete = await permissionService.checkPermission('DELETE_CLASS', turmaId ? `LoteTurma:${turmaId}` : `LoteAulas:${cursoId}`);
        if (!canDelete) {
            return { success: false, error: 'Permissão negada. Apenas administradores podem excluir grades.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        // --- TENTATIVA A: Deleção Baseada em Identificadores (FK ou CursoID + NumeroTurma) ---
        let query = supabase
            .from('aulas')
            .delete()
            .eq('tenant_id', tenantId);

        // Se informou turmaId (Nova Arquitetura), a deleção é 100% precisa por FK!
        let canProceed = false;

        if (turmaId && turmaId !== 'null' && turmaId !== 'undefined') {
            query = query.eq('turma_id', turmaId);
            canProceed = true;
        } else if (cursoId && cursoId !== 'null' && cursoId !== 'undefined') {
            // Caso clássico: deletar por curso_id e numero_turma
            query = query.eq('curso_id', cursoId);
            
            const targetTurma = (numeroTurma || '').trim();
            if (targetTurma !== '' && targetTurma !== 'null' && targetTurma !== 'undefined') {
                query = query.eq('numero_turma', targetTurma);
            } else {
                // Se não informou turma (nulo ou vazio), deleta as que não têm turma associada (nulo, vazio ou as strings "null"/"undefined")
                query = query.or('numero_turma.is.null,numero_turma.eq."",numero_turma.eq.null,numero_turma.eq.undefined');
            }
            canProceed = true;
        }

        if (!canProceed) {
            return {
                success: false,
                error: `Esta aula não possui um vínculo de curso/turma válido para exclusão em lote.`
            };
        }

        // Executamos a query e coletamos os dados deletados
        let { data: deletedRows, error } = await query.select('id');
        let countDeleted = deletedRows?.length || 0;

        if (error) {
            return { success: false, error: error.message };
        }

        if (countDeleted === 0) {
            return {
                success: false,
                error: `Nenhuma aula correspondente foi encontrada para remoção no banco de dados. (Turma: "${numeroTurma || 'Sem Turma'}")`
            };
        }

        // Audit log
        await auditService.log({
            action: 'DELETE',
            entity: 'aula',
            details: {
                type: 'LOTE_DELETION',
                cursoId,
                numeroTurma,
                turmaId,
                quantidadeDeletada: countDeleted,
                apenasAgendadas: false
            },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Métricas (EXCLUI aulas canceladas das métricas principais)
     * Pode filtrar por período opcional.
     */
    async getMetrics(period?: { start: string; end: string }): Promise<Metrics> {
        const aulas = await this._fetchPaginated((start, limit) => {
            let query = supabase
                .from('aulas')
                .select('status, horario_inicio, horario_fim, instrutor_id, curso:cursos(minutos_por_hora)');

            if (period) {
                query = query.gte('data', period.start).lte('data', period.end);
            }

            return query.range(start, start + limit - 1);
        });

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
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Select ONLY needed columns (not '*') for speed
        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('id, data, horario_inicio, horario_fim, status')
            .neq('status', 'cancelada')
            .neq('status', 'concluida')
            .lte('data', todayStr);

        if (error || !aulas || aulas.length === 0) return;

        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

        const toMinutes = (time: string) => {
            if (!time) return 0;
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        // Group IDs by target status for batch updates
        const toComplete: string[] = [];
        const toInProgress: string[] = [];

        for (const aula of aulas) {
            const isPastDay = aula.data < todayStr;
            const isToday = aula.data === todayStr;
            const endMinutes = toMinutes(aula.horario_fim);
            const startMinutes = toMinutes(aula.horario_inicio);

            if (isPastDay || (isToday && currentTimeMinutes >= endMinutes)) {
                if (aula.status !== 'concluida') toComplete.push(aula.id);
            } else if (isToday && currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
                if (aula.status !== 'em_andamento') toInProgress.push(aula.id);
            }
        }

        // Execute batch updates (max 2 requests instead of N)
        const batchOps: PromiseLike<any>[] = [];

        if (toComplete.length > 0) {
            batchOps.push(
                supabase.from('aulas').update({ status: 'concluida' }).in('id', toComplete).then()
            );
        }
        if (toInProgress.length > 0) {
            batchOps.push(
                supabase.from('aulas').update({ status: 'em_andamento' }).in('id', toInProgress).then()
            );
        }

        if (batchOps.length > 0) {
            await Promise.all(batchOps);
            // Single consolidated audit log instead of N individual logs
            await auditService.log({
                action: 'STATUS_CHANGE',
                entity: 'aula',
                entityId: 'batch',
                details: {
                    completed: toComplete.length,
                    inProgress: toInProgress.length,
                    reason: 'auto_sync_batch'
                },
                result: 'success'
            });
        }
    },

    /**
     * Relatório Mensal Comparativo de Instrutores
     * Agrupa horas/aula por mês e instrutor para o ano selecionado.
     * Exclui canceladas.
     */
    async getInstructorMonthlyReport(year: number): Promise<{
        months: string[];
        data: { instructorName: string; values: number[]; total: number }[];
    }> {
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const aulas = await this._fetchPaginated((start, limit) => {
            return supabase
                .from('aulas')
                .select('data, instrutor:instrutores(nome), status, carga_horaria_materia, horario_inicio, horario_fim, curso:cursos(minutos_por_hora)')
                .gte('data', startOfYear)
                .lte('data', endOfYear)
                .neq('status', 'cancelada')
                .range(start, start + limit - 1);
        });

        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const instructorMap = new Map<string, number[]>();

        const instructorsList = aulas?.map((a: any) => a.instrutor?.nome).filter(Boolean);
        console.log(`[Report Debug] Total aulas: ${aulas?.length || 0}`);
        console.log(`[Report Debug] Instructors found: ${Array.from(new Set(instructorsList)).join(', ')}`);

        aulas?.forEach((aula: any) => {
            // Robust name extraction (handles object or array join results)
            let nomeRaw = 'Desconhecido';
            if (aula.instrutor) {
                if (Array.isArray(aula.instrutor) && aula.instrutor.length > 0) {
                    nomeRaw = aula.instrutor[0].nome;
                } else if (typeof aula.instrutor === 'object') {
                    nomeRaw = aula.instrutor.nome;
                }
            }
            const nome = (nomeRaw || '').trim();
            if (!nome || nome === 'Desconhecido') return; // Skip orphaned/deleted instructors

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

                // NEW: Sum hours/class with duration fallback for resilience
                let horas = 0;
                if (aula.carga_horaria_materia && !isNaN(Number(aula.carga_horaria_materia)) && Number(aula.carga_horaria_materia) > 0) {
                    horas = Number(aula.carga_horaria_materia);
                } else if (aula.horario_inicio && aula.horario_fim) {
                    try {
                        const [h1, m1] = aula.horario_inicio.split(':').map(Number);
                        const [h2, m2] = aula.horario_fim.split(':').map(Number);
                        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (totalMinutes > 0) {
                            horas = Math.round((totalMinutes / (aula.curso?.minutos_por_hora || 60)) * 100) / 100;
                        }
                    } catch { horas = 0; }
                }

                if (horas > 0 && nome.includes('Deivid')) {
                    console.log(`[Report Debug] Deivid Aula: ${aula.data} - Horas: ${horas} (Carga: ${aula.carga_horaria_materia}, Dur: ${aula.horario_inicio}-${aula.horario_fim})`);
                }

                currentCounts[monthIndex] += horas;
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
     * Histórico Mensal de Horas/Aula
     */
    async getMonthlyHistory(date: Date): Promise<{ totalClasses: number; totalHours: number; completed: number }[]> {
        const year = date.getFullYear();
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const aulas = await this._fetchPaginated((start, limit) => {
            return supabase
                .from('aulas')
                .select('data, status, carga_horaria_materia, horario_inicio, horario_fim, curso:cursos(minutos_por_hora)')
                .gte('data', startOfYear)
                .lte('data', endOfYear)
                .neq('status', 'cancelada')
                .range(start, start + limit - 1);
        });

        const historyMap = new Map<string, { totalClasses: number; totalHours: number; completed: number }>();

        for (let i = 0; i < 12; i++) {
            const d = new Date(year, i, 1);
            const monthKey = d.toISOString().slice(0, 7);
            historyMap.set(monthKey, { totalClasses: 0, totalHours: 0, completed: 0 });
        }

        aulas?.forEach((aula: any) => {
            const monthKey = aula.data.slice(0, 7);
            if (historyMap.has(monthKey)) {
                const entry = historyMap.get(monthKey)!;

                // NEW: Sum hours/class with duration fallback for resilience
                let horas = 0;
                if (aula.carga_horaria_materia && !isNaN(Number(aula.carga_horaria_materia)) && Number(aula.carga_horaria_materia) > 0) {
                    horas = Number(aula.carga_horaria_materia);
                } else if (aula.horario_inicio && aula.horario_fim) {
                    try {
                        const [h1, m1] = aula.horario_inicio.split(':').map(Number);
                        const [h2, m2] = aula.horario_fim.split(':').map(Number);
                        const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (totalMinutes > 0) {
                            horas = Math.round((totalMinutes / (aula.curso?.minutos_por_hora || 60)) * 100) / 100;
                        }
                    } catch { horas = 0; }
                }

                entry.totalClasses += horas; // Now represents hours/class, not event count
                entry.totalHours += horas; // Keep both for compatibility

                if (aula.status === 'concluida') {
                    entry.completed += horas;
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

    async getGrowthTrend(history: { totalClasses: number; totalHours: number }[]): Promise<{ growthRate: number; isPositive: boolean; currentMonth: number; previousMonth: number }> {
        const currentMonthIndex = new Date().getMonth();
        if (currentMonthIndex === 0) return { growthRate: 0, isPositive: true, currentMonth: 0, previousMonth: 0 };

        // NEW: Use totalHours (which now represents hours/class) instead of totalClasses
        const current = history[currentMonthIndex].totalHours;
        const previous = history[currentMonthIndex - 1].totalHours;

        if (previous === 0) return { growthRate: current > 0 ? 100 : 0, isPositive: true, currentMonth: Math.round(current), previousMonth: 0 };

        const change = current - previous;
        const rate = (change / previous) * 100;

        return {
            growthRate: Math.abs(Math.round(rate)),
            isPositive: rate >= 0,
            currentMonth: Math.round(current),
            previousMonth: Math.round(previous)
        };
    },

    /**
     * MAPA DE SALAS — Fonte de dados centralizada
     * Reutiliza aulaService.list() com includeRelations para garantir
     * consistência total com as demais visões do sistema.
     * NÃO filtra no frontend — delega tudo ao backend (RLS + filtro de data).
     */
    async getAulasEntrePeriodo(dataInicio: string, dataFim: string): Promise<AulaMapaSala[]> {
        const rawData = await this.list({
            dateFrom: dataInicio,
            dateTo: dataFim,
            includeRelations: true
        });

        return (rawData as any[]).map((a): AulaMapaSala => ({
            id: a.id,
            data: a.data,
            horarioInicio: a.horario_inicio,
            horarioFim: a.horario_fim,
            salaId: a.sala || 'sem-sala',
            sala: a.sala || 'Sem sala definida',
            curso: a.curso?.nome || '',
            materia: a.materia?.nome || '',
            instrutor: a.instrutor?.nome || '',
            cor: a.curso?.cor || '#3B82F6',
            status: a.status,
            minutosPorHora: a.curso?.minutos_por_hora || 60,
            tipoAula: a.tipo_aula,
            origem: a.origem
        }));
    }
};

// ============================================
// TIPOS PÚBLICOS DO MAPA DE SALAS
// ============================================

export interface AulaMapaSala {
    id: string;
    data: string;          // YYYY-MM-DD
    horarioInicio: string; // HH:mm
    horarioFim: string;    // HH:mm
    salaId: string;        // sala normalizada (lowercase) para agrupamentos
    sala: string;          // sala para exibição
    curso: string;
    materia: string;
    instrutor: string;
    cor: string;           // hex color para identidade visual
    status: string;
    minutosPorHora: number;
    tipoAula?: string;
    origem?: string;
}
