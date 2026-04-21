// ============================================
// USE AUTH HOOK
// Hook React para autenticação
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { authService, UserProfile, LoginResult } from '../services/auth.service';
import { tenantService } from '../services/tenant.service';
import { permissionService, UserRole } from '../services/permission.service';

interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: UserProfile | null;
    error: string | null;
}

interface AuthActions {
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
}

export function useAuth(): AuthState & AuthActions {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        error: null
    });

    // Restaurar sessão ao carregar
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const restored = await authService.restoreSession();
                if (restored) {
                    const user = await authService.getCurrentUser();
                    setState({
                        isAuthenticated: true,
                        isLoading: false,
                        user,
                        error: null
                    });
                } else {
                    setState({
                        isAuthenticated: false,
                        isLoading: false,
                        user: null,
                        error: null
                    });
                }
            } catch (error) {
                setState({
                    isAuthenticated: false,
                    isLoading: false,
                    user: null,
                    error: 'Erro ao restaurar sessão'
                });
            }
        };

        restoreSession();
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const result = await authService.login(email, password);

        if (result.success) {
            const user = await authService.getCurrentUser();
            setState({
                isAuthenticated: true,
                isLoading: false,
                user,
                error: null
            });
        } else {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: result.error || 'Erro no login'
            }));
        }

        return result;
    }, []);

    const logout = useCallback(async () => {
        await authService.logout();
        setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: null
        });
    }, []);

    return {
        ...state,
        login,
        logout
    };
}
