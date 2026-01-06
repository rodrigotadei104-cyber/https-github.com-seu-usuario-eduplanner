// ============================================
// AUTH SERVICE
// Autenticação com validação de status
// ============================================

import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService, UserRole } from './permission.service';
import { auditService } from './audit.service';

export interface LoginResult {
    success: boolean;
    error?: string;
    userId?: string;
    tenantId?: string;
    role?: UserRole;
}

export interface UserProfile {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: UserRole;
    status: 'pending' | 'active' | 'inactive';
}

export const authService = {
    /**
     * Login com validação completa de status
     */
    async login(email: string, password: string): Promise<LoginResult> {
        // 1. Tentar autenticação no Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            // Tentar buscar tenant do usuário para logar a falha
            const { data: userLookup } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('email', email)
                .single();

            if (userLookup?.tenant_id) {
                await auditService.logWithTenant(userLookup.tenant_id, {
                    action: 'LOGIN_FAIL',
                    entity: 'auth',
                    details: { email, reason: authError.message },
                    result: 'failure'
                });
            }

            return { success: false, error: `Erro no login: ${authError.message}` };
        }

        // 2. Buscar perfil do usuário (inclui tenant_id e status)
        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('id, tenant_id, status, role, name, email')
            .eq('id', authData.user.id)
            .single();

        if (profileError || !userProfile) {
            await supabase.auth.signOut();
            return { success: false, error: 'Perfil não encontrado.' };
        }

        // 3. VALIDAÇÃO DE STATUS (OBRIGATÓRIA)
        if (userProfile.status === 'pending') {
            await supabase.auth.signOut();
            await auditService.logWithTenant(userProfile.tenant_id, {
                action: 'LOGIN_FAIL',
                entity: 'auth',
                userId: userProfile.id,
                details: { reason: 'Account pending activation' },
                result: 'failure'
            });
            return { success: false, error: 'Conta não ativada. Verifique seu e-mail.' };
        }

        if (userProfile.status === 'inactive') {
            await supabase.auth.signOut();
            await auditService.logWithTenant(userProfile.tenant_id, {
                action: 'LOGIN_FAIL',
                entity: 'auth',
                userId: userProfile.id,
                details: { reason: 'Account inactive' },
                result: 'failure'
            });
            return { success: false, error: 'Acesso bloqueado. Contate o administrador.' };
        }

        // 4. Configurar contextos dos serviços
        tenantService.setCurrentTenant(userProfile.tenant_id);
        permissionService.setCurrentUser(userProfile.id, userProfile.role as UserRole);

        // 5. Login bem-sucedido - log após configurar contexto
        await auditService.log({
            action: 'LOGIN_SUCCESS',
            entity: 'auth',
            userId: userProfile.id,
            result: 'success'
        });

        // 6. Atualizar last_login
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userProfile.id);

        return {
            success: true,
            userId: userProfile.id,
            tenantId: userProfile.tenant_id,
            role: userProfile.role as UserRole
        };
    },

    /**
     * Obter perfil do usuário atual
     */
    async getCurrentUser(): Promise<UserProfile | null> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('users')
            .select('id, tenant_id, email, name, role, status')
            .eq('id', user.id)
            .single();

        if (error || !data) return null;
        return data as UserProfile;
    },

    /**
     * Verificar se há sessão ativa e restaurar contexto
     */
    async restoreSession(): Promise<boolean> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const profile = await this.getCurrentUser();
        if (!profile || profile.status !== 'active') {
            await this.logout();
            return false;
        }

        tenantService.setCurrentTenant(profile.tenant_id);
        permissionService.setCurrentUser(profile.id, profile.role as UserRole);
        return true;
    },

    /**
     * Logout com limpeza de contextos
     */
    async logout(): Promise<void> {
        tenantService.clearContext();
        permissionService.clearContext();
        await supabase.auth.signOut();
    },

    /**
     * Solicitar recuperação de senha por e-mail
     */
    async resetPasswordForEmail(email: string): Promise<{ success: boolean; error?: string }> {
        // Redireciona para a raiz. O Supabase adicionará #access_token=...&type=recovery automaticamente
        const redirectTo = `${window.location.origin}`;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectTo,
        });

        if (error) {
            console.error('Reset Password Error:', error);
            // Translate generic error messages if needed for better UX
            return { success: false, error: error.message };
        }

        return { success: true };
    }
};
