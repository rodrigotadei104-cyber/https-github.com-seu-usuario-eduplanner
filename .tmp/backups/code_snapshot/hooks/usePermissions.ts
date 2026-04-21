// ============================================
// USE PERMISSIONS HOOK
// Hook React para verificação de permissões no frontend
// ============================================

import { useMemo } from 'react';
import { UserRole } from '../services/permission.service';

export interface PermissionFlags {
    // Classes
    canCreateClass: boolean;
    canEditClass: boolean;
    canCancelClass: boolean;

    // Users
    canManageUsers: boolean;
    canViewLogs: boolean;

    // Registrations
    canManageRegistrations: boolean;

    // General
    isReadOnly: boolean;
    isAdmin: boolean;
    isEditor: boolean;
    isViewer: boolean;
}

/**
 * Hook para obter flags de permissão baseado no role do usuário
 * IMPORTANTE: Isso é apenas para controle de UI.
 * O backend SEMPRE valida as permissões independentemente.
 */
export function usePermissions(role: UserRole | null): PermissionFlags {
    return useMemo(() => ({
        // Classes
        canCreateClass: role === 'admin' || role === 'editor',
        canEditClass: role === 'admin' || role === 'editor',
        canCancelClass: role === 'admin',

        // Users
        canManageUsers: role === 'admin',
        canViewLogs: role === 'admin',

        // Registrations
        canManageRegistrations: role === 'admin' || role === 'editor',

        // General
        isReadOnly: role === 'viewer',
        isAdmin: role === 'admin',
        isEditor: role === 'editor',
        isViewer: role === 'viewer'
    }), [role]);
}
