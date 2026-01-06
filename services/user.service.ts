// ============================================
// USER SERVICE
// Gestão de usuários com proteções obrigatórias
// ============================================

import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService, UserRole } from './permission.service';
import { auditService } from './audit.service';

export interface CreateUserInput {
    email: string;
    name: string;
    role: UserRole;
}

export interface ServiceResult {
    success: boolean;
    error?: string;
    data?: unknown;
}

export const userService = {
    /**
     * Listar usuários do tenant atual
     */
    async list(): Promise<unknown[]> {
        const { data, error } = await supabase
            .from('users')
            .select('id, tenant_id, email, name, role, status, created_at, last_login')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Criar usuário com convite (Admin only)
     */
    async create(input: CreateUserInput): Promise<ServiceResult> {
        // 1. Validação de permissão
        const canCreate = await permissionService.checkPermission('CREATE_USER', 'User');
        if (!canCreate) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        // 2. Tentar usar Edge Function primeiro (Fluxo Oficial com Email)
        try {
            const { data: functionData, error: functionError } = await supabase.functions.invoke('invite-user', {
                body: {
                    email: input.email,
                    name: input.name,
                    role: input.role
                }
            });

            if (!functionError && functionData?.success) {
                return { success: true, data: functionData.data };
            }

            // Se erro específico da função, retornar
            if (functionData?.error) {
                console.error('Edge Function Error:', functionData.error);
                return { success: false, error: functionData.error };
            }

            // Se erro de rede ou 404 (função não deployada), logar e cair no fallback (apenas DEV)
            console.warn('Edge Function invite-user indisponível, usando fallback local (sem envio de email).', functionError);
        } catch (err) {
            console.warn('Erro ao chamar Edge Function:', err);
        }

        // --- FALLBACK LOCAL (Sem envio de email real) ---
        // Útil para dev local sem Edge Functions rodando

        // Verificar se email já existe
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', input.email)
            .single();

        if (existing) {
            return { success: false, error: 'Email já cadastrado.' };
        }

        // Gerar ID temporário
        const tempId = crypto.randomUUID();

        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                id: tempId,
                tenant_id: tenantId,
                email: input.email,
                name: input.name,
                role: input.role,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            return { success: false, error: insertError.message };
        }

        if (!newUser) {
            return { success: false, error: 'Usuário foi criado mas não retornou dados.' };
        }

        // Criar convite manual (fallback)
        const token = crypto.randomUUID().replace(/-/g, '');
        await supabase
            .from('invitations')
            .insert({
                user_id: newUser.id,
                tenant_id: tenantId,
                token: token
            });

        // Audit log fallback
        await auditService.log({
            action: 'INVITE_SENT',
            entity: 'user',
            entityId: newUser.id,
            details: { email: input.email, role: input.role, method: 'local_fallback' },
            result: 'success'
        });

        return { success: true, data: newUser };
    },

    /**
     * Atualizar role de usuário (Admin only)
     * REGRA: Usuário NÃO pode alterar próprio role
     */
    async updateRole(targetUserId: string, newRole: UserRole): Promise<ServiceResult> {
        // 1. Validação de permissão
        const canEdit = await permissionService.checkPermission('EDIT_USER', `User:${targetUserId}`);
        if (!canEdit) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. REGRA CRÍTICA: Bloquear alteração do próprio role
        const currentUserId = permissionService.getCurrentUserId();
        if (targetUserId === currentUserId) {
            await auditService.log({
                action: 'UNAUTHORIZED_ACCESS',
                entity: 'user',
                entityId: targetUserId,
                details: { reason: 'Self role change blocked', attemptedRole: newRole },
                result: 'failure'
            });
            return { success: false, error: 'Não é permitido alterar seu próprio nível de acesso.' };
        }

        // 3. Buscar usuário alvo para validação de tenant
        const { data: targetUser, error: fetchError } = await supabase
            .from('users')
            .select('id, tenant_id, role')
            .eq('id', targetUserId)
            .single();

        if (fetchError || !targetUser) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        // 4. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(
            targetUser.tenant_id,
            'user',
            targetUserId
        );
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 5. Executar update
        const { error: updateError } = await supabase
            .from('users')
            .update({ role: newRole })
            .eq('id', targetUserId);

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        await auditService.log({
            action: 'UPDATE',
            entity: 'user',
            entityId: targetUserId,
            details: { previousRole: targetUser.role, newRole },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Atualizar status de usuário (ativar/inativar)
     * REGRAS:
     * - Usuário NÃO pode alterar próprio status
     * - NÃO pode inativar último admin do tenant
     */
    async updateStatus(
        targetUserId: string,
        newStatus: 'active' | 'inactive'
    ): Promise<ServiceResult> {
        // 1. Validação de permissão
        const canEdit = await permissionService.checkPermission('DEACTIVATE_USER', `User:${targetUserId}`);
        if (!canEdit) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. REGRA CRÍTICA: Bloquear alteração do próprio status
        const currentUserId = permissionService.getCurrentUserId();
        if (targetUserId === currentUserId) {
            await auditService.log({
                action: 'UNAUTHORIZED_ACCESS',
                entity: 'user',
                entityId: targetUserId,
                details: { reason: 'Self status change blocked', attemptedStatus: newStatus },
                result: 'failure'
            });
            return { success: false, error: 'Não é permitido alterar seu próprio status.' };
        }

        // 3. Buscar usuário alvo
        const { data: targetUser, error: fetchError } = await supabase
            .from('users')
            .select('id, tenant_id, role, status')
            .eq('id', targetUserId)
            .single();

        if (fetchError || !targetUser) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        // 4. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(
            targetUser.tenant_id,
            'user',
            targetUserId
        );
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 5. REGRA CRÍTICA: Proteção do último admin
        if (newStatus === 'inactive' && targetUser.role === 'admin') {
            const { count, error: countError } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', targetUser.tenant_id)
                .eq('role', 'admin')
                .eq('status', 'active');

            if (countError) {
                return { success: false, error: 'Erro ao verificar administradores.' };
            }

            // Se há apenas 1 admin ativo (que é o alvo), bloquear
            if (count !== null && count <= 1) {
                await auditService.log({
                    action: 'UNAUTHORIZED_ACCESS',
                    entity: 'user',
                    entityId: targetUserId,
                    details: { reason: 'Cannot deactivate last admin', blocked: true },
                    result: 'failure'
                });
                return { success: false, error: 'Não é possível desativar o último administrador.' };
            }
        }

        // 6. Executar update
        const { error: updateError } = await supabase
            .from('users')
            .update({ status: newStatus })
            .eq('id', targetUserId);

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        await auditService.log({
            action: 'STATUS_CHANGE',
            entity: 'user',
            entityId: targetUserId,
            details: { previousStatus: targetUser.status, newStatus },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Aceitar convite (DEV/TEST only)
     * Simula o fluxo de aceite de convite sem envio de email
     * REGRAS:
     * - Só funciona para usuários com status 'pending'
     * - Transição: pending → active
     * - Mesmas validações do fluxo real
     */
    async acceptInvitation(targetUserId: string): Promise<ServiceResult> {
        // 1. Validação de permissão (Admin only)
        const canEdit = await permissionService.checkPermission('EDIT_USER', `User:${targetUserId}`);
        if (!canEdit) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. Buscar usuário alvo
        const { data: targetUser, error: fetchError } = await supabase
            .from('users')
            .select('id, tenant_id, email, name, role, status')
            .eq('id', targetUserId)
            .single();

        if (fetchError || !targetUser) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        // 3. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(
            targetUser.tenant_id,
            'user',
            targetUserId
        );
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 4. REGRA: Só aceita convites de usuários pendentes
        if (targetUser.status !== 'pending') {
            await auditService.log({
                action: 'INVITE_ACCEPTED',
                entity: 'user',
                entityId: targetUserId,
                details: {
                    reason: 'User not in pending status',
                    currentStatus: targetUser.status,
                    blocked: true
                },
                result: 'failure'
            });
            return { success: false, error: 'Apenas usuários com convite pendente podem ser ativados.' };
        }

        // 5. Atualizar status para active
        const { error: updateError } = await supabase
            .from('users')
            .update({ status: 'active' })
            .eq('id', targetUserId);

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        // 6. Remover convite (se existir)
        await supabase
            .from('invitations')
            .delete()
            .eq('user_id', targetUserId);

        // 7. Audit log
        await auditService.log({
            action: 'INVITE_ACCEPTED',
            entity: 'user',
            entityId: targetUserId,
            details: {
                email: targetUser.email,
                name: targetUser.name,
                role: targetUser.role,
                method: 'DEV_TEST_MANUAL'
            },
            result: 'success'
        });

        return { success: true };
    },

    /**
     * Define senha de teste e vincula ao Auth (DEV only)
     */
    /**
     * Reenviar convite (Admin only)
     * Chama a Edge Function novamente para disparar o email
     */
    async resendInvitation(userId: string): Promise<ServiceResult> {
        // 1. Validação de permissão
        const canEdit = await permissionService.checkPermission('CREATE_USER', 'User'); // Same permission as create
        if (!canEdit) {
            return { success: false, error: 'Permissão negada.' };
        }

        // 2. Buscar dados do usuário alvo
        const { data: targetUser, error: fetchError } = await supabase
            .from('users')
            .select('email, name, role, tenant_id')
            .eq('id', userId)
            .single();

        if (fetchError || !targetUser) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        // 3. Validação de tenant
        const tenantValid = await tenantService.validateTenantAccess(
            targetUser.tenant_id,
            'user',
            userId
        );
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // 4. Chamar Edge Function
        // 4. Chamar Edge Function
        try {
            const { data: functionData, error: functionError } = await supabase.functions.invoke('invite-user', {
                body: {
                    email: targetUser.email,
                    name: targetUser.name,
                    role: targetUser.role
                }
            });

            // Handle errors returned as 200 OK JSON or HTTP errors
            if (functionError || (functionData && functionData.error)) {
                const errMsg = functionData?.error || functionError?.message || 'Erro desconhecido na função.';
                console.error('Edge Function Resend Error:', errMsg);
                // Retornar a mensagem exata para o frontend
                return { success: false, error: `Falha no envio: ${errMsg}` };
            }

            // Audit
            await auditService.log({
                action: 'INVITE_RESENT',
                entity: 'user',
                entityId: userId,
                details: { email: targetUser.email, method: 'edge_function' },
                result: 'success'
            });

            return { success: true };

        } catch (err: any) {
            console.error('Resend Exception:', err);
            return { success: false, error: `Erro de conexão: ${err.message}` };
        }
    },

    /**
     * Define senha de teste e vincula ao Auth (DEV only)
     */
    async setTestPassword(targetUserId: string, password: string): Promise<ServiceResult> {
        // 1. Buscar usuário
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', targetUserId)
            .single();

        if (fetchError || !user) return { success: false, error: 'Usuário não encontrado.' };

        // 2. Criar no Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: user.email,
            password: password,
            options: {
                data: { name: user.name }
            }
        });

        if (authError) return { success: false, error: `Erro no Auth: ${authError.message}` };
        if (!authData.user) return { success: false, error: 'Erro ao criar usuário no Auth.' };

        const newAuthId = authData.user.id;

        // 3. Atualizar ID na tabela public.users
        const { error: deleteError } = await supabase.from('users').delete().eq('id', targetUserId);
        if (deleteError) return { success: false, error: 'Erro ao migrar ID de teste.' };

        const { error: insertError } = await supabase.from('users').insert({
            id: newAuthId,
            tenant_id: user.tenant_id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: 'active'
        });

        if (insertError) return { success: false, error: 'Erro ao finalizar migração de usuário.' };

        return { success: true };
    },

    /**
     * Excluir usuário permanentemente (Admin only)
     */
    async delete(targetUserId: string): Promise<ServiceResult> {
        // 1. Validação de permissão
        const isAdmin = await permissionService.isAdmin();
        if (!isAdmin) {
            return { success: false, error: 'Permissão negada. Apenas administradores podem excluir usuários.' };
        }

        const currentUserId = permissionService.getCurrentUserId();
        if (targetUserId === currentUserId) {
            return { success: false, error: 'Você não pode excluir sua própria conta.' };
        }

        try {
            const { data: functionData, error: functionError } = await supabase.functions.invoke('delete-user', {
                body: { userId: targetUserId }
            });

            if (functionError || (functionData && functionData.error)) {
                const errMsg = functionData?.error || functionError?.message || 'Erro desconhecido ao excluir.';
                console.error('Delete User Error:', errMsg);
                return { success: false, error: errMsg };
            }

            return { success: true };
        } catch (err: any) {
            console.error('Delete Exception:', err);
            return { success: false, error: `Erro de conexão: ${err.message}` };
        }
    }
};
