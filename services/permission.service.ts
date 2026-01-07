// ============================================
// PERMISSION SERVICE
// Matriz de permissões e validação RBAC
// ============================================

export type UserRole = 'admin' | 'editor' | 'viewer';

export type Action =
    | 'CREATE_CLASS' | 'EDIT_CLASS' | 'CANCEL_CLASS' | 'DELETE_CLASS'
    | 'CREATE_USER' | 'EDIT_USER' | 'DEACTIVATE_USER'
    | 'VIEW_LOGS'
    | 'MANAGE_REGISTRATIONS';

/**
 * Matriz de permissões conforme requisitos aprovados
 * TRUE = permitido, FALSE = bloqueado
 */
const PERMISSION_MATRIX: Record<UserRole, Partial<Record<Action, boolean>>> = {
    admin: {
        CREATE_CLASS: true,
        EDIT_CLASS: true,
        CANCEL_CLASS: true,        // SOMENTE Admin
        DELETE_CLASS: true,        // SOMENTE Admin (Limpeza)
        CREATE_USER: true,
        EDIT_USER: true,
        DEACTIVATE_USER: true,
        VIEW_LOGS: true,           // SOMENTE Admin
        MANAGE_REGISTRATIONS: true
    },
    editor: {
        CREATE_CLASS: true,
        EDIT_CLASS: true,
        CANCEL_CLASS: false,       // Editor NÃO pode cancelar
        DELETE_CLASS: false,
        CREATE_USER: false,
        EDIT_USER: false,
        DEACTIVATE_USER: false,
        VIEW_LOGS: false,
        MANAGE_REGISTRATIONS: true
    },
    viewer: {
        CREATE_CLASS: false,       // Viewer é READ-ONLY
        EDIT_CLASS: false,
        CANCEL_CLASS: false,
        DELETE_CLASS: false,
        CREATE_USER: false,
        EDIT_USER: false,
        DEACTIVATE_USER: false,
        VIEW_LOGS: false,
        MANAGE_REGISTRATIONS: false
    }
};

let currentUserRole: UserRole | null = null;
let currentUserId: string | null = null;

export const permissionService = {
    /**
     * Define contexto do usuário (após login)
     */
    setCurrentUser(userId: string, role: UserRole): void {
        currentUserId = userId;
        currentUserRole = role;
    },

    /**
     * Obtém o ID do usuário atual
     */
    getCurrentUserId(): string | null {
        return currentUserId;
    },

    /**
     * Obtém o role do usuário atual
     */
    getCurrentRole(): UserRole | null {
        return currentUserRole;
    },

    /**
     * Verifica permissão e retorna boolean
     * Para ações que necessitam logging, use checkPermissionWithLog
     */
    hasPermission(action: Action): boolean {
        if (!currentUserRole) {
            return false;
        }
        return PERMISSION_MATRIX[currentUserRole][action] ?? false;
    },

    /**
     * Verifica permissão e loga se não permitido
     */
    async checkPermission(action: Action, context?: string): Promise<boolean> {
        if (!currentUserRole) {
            console.error('SECURITY: No user context for permission check');
            return false;
        }

        const allowed = PERMISSION_MATRIX[currentUserRole][action] ?? false;

        if (!allowed) {
            // Import dinâmico para evitar dependência circular
            const { auditService } = await import('./audit.service');
            await auditService.log({
                action: 'UNAUTHORIZED_ACCESS',
                entity: context || action,
                details: {
                    attemptedAction: action,
                    userRole: currentUserRole,
                    blocked: true
                },
                result: 'failure'
            });
            return false;
        }

        return true;
    },

    // ============================================
    // HELPERS (verificação rápida sem logging)
    // ============================================

    canManageClasses(): boolean {
        return currentUserRole === 'admin' || currentUserRole === 'editor';
    },

    canCancelClasses(): boolean {
        return currentUserRole === 'admin';
    },

    canManageUsers(): boolean {
        return currentUserRole === 'admin';
    },

    canViewLogs(): boolean {
        return currentUserRole === 'admin';
    },

    canManageRegistrations(): boolean {
        return currentUserRole === 'admin' || currentUserRole === 'editor';
    },

    isViewer(): boolean {
        return currentUserRole === 'viewer';
    },

    isAdmin(): boolean {
        return currentUserRole === 'admin';
    },

    /**
     * Limpa contexto no logout
     */
    clearContext(): void {
        currentUserRole = null;
        currentUserId = null;
    }
};
