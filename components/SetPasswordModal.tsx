import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSchedule } from '../context/ScheduleContext';
import { Loader2, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { userService } from '../services';

interface SetPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'invite' | 'recovery';
}

export const SetPasswordModal: React.FC<SetPasswordModalProps> = ({ isOpen, onClose, type }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [waitingForSession, setWaitingForSession] = useState(true);
    const [recoveryTokens, setRecoveryTokens] = useState<{ access_token: string, refresh_token: string } | null>(null);
    const { userProfile } = useSchedule();

    // Para recovery, não precisamos esperar sessão - o Supabase usa o token da URL
    // No entanto, precisamos capturar o token IMEDIATAMENTE antes que o Supabase limpe a URL
    React.useEffect(() => {
        if (!isOpen) return;

        // Se for recovery, capturar tokens e resetar erro
        if (type === 'recovery') {
            const hash = window.location.hash;
            const hashParams = new URLSearchParams(hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (accessToken) {
                setRecoveryTokens({
                    access_token: accessToken,
                    refresh_token: refreshToken || ''
                });
            }

            setWaitingForSession(false);
            setError(null);
        } else {
            // Para invite, verificar sessão
            const checkSession = async () => {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    setWaitingForSession(false);
                } else {
                    setWaitingForSession(false);
                    setError('Sessão expirada. Use o link do e-mail de convite novamente.');
                }
            };
            checkSession();
        }
    }, [isOpen, type]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('A senha deve ter no mínimo 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('As senhas não conferem.');
            return;
        }

        try {
            setLoading(true);

            // 1. Logica de Reset via Edge Function (mais robusta que client-side session)
            if (type === 'recovery') {
                let accessToken = recoveryTokens?.access_token;

                // Fallback: Tentar ler da URL se não capturou antes
                if (!accessToken) {
                    const hash = window.location.hash;
                    const hashParams = new URLSearchParams(hash.substring(1));
                    accessToken = hashParams.get('access_token') || undefined;
                }

                if (!accessToken) {
                    throw new Error('Token de recuperação não encontrado. Solicite um novo link.');
                }

                console.log('Calling Edge Function reset-password-secure...');
                const { data: result, error: fnError } = await supabase.functions.invoke('reset-password-secure', {
                    body: {
                        accessToken: accessToken,
                        newPassword: password
                    }
                });

                if (fnError) throw fnError;
                if (result?.error) throw new Error(result.error);

                // Sucesso!
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                    // Limpar URL e recarregar para garantir estado limpo para login
                    window.location.hash = '';
                    window.location.reload();
                }, 2000);
                return; // Encerrar aqui, não executar o updateUser padrão
            }

            // 2. Se for Invite ou outro caso, usar client normal
            const { error: updateError } = await supabase.auth.updateUser({ password: password });

            if (updateError) throw updateError;

            // 3. Invite activation logic
            if (type === 'invite') {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    // Tenta ativar usuario se necessario
                    const { error: statusError } = await supabase
                        .from('users')
                        .update({ status: 'active' })
                        .eq('id', user.id);
                    if (statusError) console.error('Failed to activate status:', statusError);
                }
            }

            setSuccess(true);
            setTimeout(() => {
                onClose();
                window.location.hash = '';
            }, 2000);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao definir senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex justify-center mb-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Lock size={24} />
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-center text-gray-800 dark:text-white mb-2">
                        {type === 'invite' ? 'Bem-vindo ao EduPlanner!' : 'Redefinir Senha'}
                    </h2>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-6">
                        {type === 'invite'
                            ? 'Para ativar sua conta, por favor defina uma senha segura.'
                            : 'Crie uma nova senha para acessar sua conta.'}
                    </p>

                    {waitingForSession ? (
                        <div className="flex flex-col items-center justify-center py-6 text-gray-500 dark:text-gray-400">
                            <Loader2 size={48} className="mb-3 animate-spin" />
                            <p className="font-medium">Verificando autenticação...</p>
                        </div>
                    ) : success ? (
                        <div className="flex flex-col items-center justify-center py-6 text-green-600 dark:text-green-400 animate-in fade-in">
                            <CheckCircle size={48} className="mb-3" />
                            <p className="font-semibold">Senha definida com sucesso!</p>
                            <p className="text-sm mt-1">
                                {type === 'recovery' ? 'Redirecionando para login...' : 'Entrando no sistema...'}
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova Senha</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar Senha</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md flex items-center gap-2 dark:bg-red-900/20 dark:text-red-300">
                                    <AlertTriangle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 size={18} className="animate-spin" />}
                                {loading ? 'Salvando...' : 'Definir Senha'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
