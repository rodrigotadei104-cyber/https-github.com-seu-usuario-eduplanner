// ============================================
// AUDIT SERVICE
// Logs de auditoria imutáveis
// ============================================

import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';

export type AuditAction =
    | 'LOGIN_SUCCESS' | 'LOGIN_FAIL'
    | 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'CANCEL'
    | 'INVITE_SENT' | 'INVITE_ACCEPTED' | 'INVITE_RESENT'
    | 'UNAUTHORIZED_ACCESS' | 'CROSS_TENANT_ATTEMPT';

export interface AuditEntry {
    action: AuditAction;
    entity: string;
    entityId?: string;
    userId?: string;
    details?: Record<string, unknown>;
    result: 'success' | 'failure';
}

export const auditService = {
    /**
     * Log padrão (usa tenant do contexto atual)
     * Se não houver tenant, registra apenas no console
     */
    async log(entry: AuditEntry): Promise<void> {
        try {
            if (tenantService.hasTenantContext()) {
                const tenantId = tenantService.getCurrentTenantId();
                await this.insertLog(tenantId, entry);
            } else {
                // Login falhado antes de contexto - log apenas no console
                console.warn('Audit log without tenant context:', entry);
            }
        } catch (error) {
            console.error('Audit log error:', error);
        }
    },

    /**
     * Log com tenant explícito (para login/eventos pré-autenticação)
     */
    async logWithTenant(tenantId: string, entry: AuditEntry): Promise<void> {
        await this.insertLog(tenantId, entry);
    },

    /**
     * Inserção no banco (APPEND-ONLY, nunca edita/deleta)
     */
    async insertLog(tenantId: string, entry: AuditEntry): Promise<void> {
        const { data: user } = await supabase.auth.getUser();
        const userEmail = user?.user?.email || entry.userId || 'system';

        // CORREÇÃO: Definir valor explícito quando role é null
        const userRole = permissionService.getCurrentRole() ?? 'anonymous';

        const { error } = await supabase.from('audit_logs').insert({
            tenant_id: tenantId,
            user_id: entry.userId || user?.user?.id || null,
            user_email: userEmail,
            user_role: userRole,
            action: entry.action,
            entity: entry.entity,
            entity_id: entry.entityId || null,
            details: entry.details || {},
            result: entry.result
        });

        if (error) {
            console.error('Failed to write audit log:', error);
        }
    },

    /**
     * Buscar logs (APENAS ADMIN pode chamar)
     */
    async getLogs(limit: number = 100): Promise<unknown[]> {
        if (!permissionService.canViewLogs()) {
            throw new Error('UNAUTHORIZED: Only admins can view logs');
        }

        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }
};
