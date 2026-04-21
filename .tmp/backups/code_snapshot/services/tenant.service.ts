// ============================================
// TENANT SERVICE
// Gerencia contexto de tenant e validação de acesso
// ============================================

import { supabase } from '../lib/supabase';

let currentTenantId: string | null = null;

export const tenantService = {
    /**
     * Define o tenant do contexto atual (após login)
     */
    setCurrentTenant(tenantId: string): void {
        currentTenantId = tenantId;
    },

    /**
     * Obtém o tenant atual (DEVE existir em qualquer operação)
     * @throws Error se não houver contexto de tenant
     */
    getCurrentTenantId(): string {
        if (!currentTenantId) {
            throw new Error('SECURITY: No tenant context. Aborting operation.');
        }
        return currentTenantId;
    },

    /**
     * Verifica se há um tenant ativo (sem lançar erro)
     */
    hasTenantContext(): boolean {
        return currentTenantId !== null;
    },

    /**
     * VALIDAÇÃO CRÍTICA: Verifica se recurso pertence ao tenant atual
     * Retorna true se acesso permitido, false se bloqueado
     * 
     * @param resourceTenantId - tenant_id do recurso sendo acessado
     * @param resourceType - tipo do recurso (para logging)
     * @param resourceId - id do recurso (para logging)
     */
    async validateTenantAccess(
        resourceTenantId: string | undefined,
        resourceType: string,
        resourceId?: string
    ): Promise<boolean> {
        // Import dinâmico para evitar dependência circular
        const { auditService } = await import('./audit.service');

        const currentTenant = this.getCurrentTenantId();

        // 1. Recurso sem tenant definido = erro de integridade
        if (!resourceTenantId) {
            console.error(`SECURITY: Resource ${resourceType}:${resourceId} has no tenant_id`);
            await auditService.log({
                action: 'UNAUTHORIZED_ACCESS',
                entity: resourceType,
                entityId: resourceId,
                details: { reason: 'Resource missing tenant_id' },
                result: 'failure'
            });
            return false;
        }

        // 2. CROSS-TENANT ATTEMPT (CRÍTICO)
        if (resourceTenantId !== currentTenant) {
            console.error(`SECURITY: Cross-tenant access blocked. User: ${currentTenant}, Target: ${resourceTenantId}`);
            await auditService.log({
                action: 'CROSS_TENANT_ATTEMPT',
                entity: resourceType,
                entityId: resourceId,
                details: {
                    userTenant: currentTenant,
                    targetTenant: resourceTenantId,
                    blocked: true
                },
                result: 'failure'
            });
            return false;
        }

        return true;
    },

    /**
     * Limpa contexto no logout
     */
    clearContext(): void {
        currentTenantId = null;
    }
};
