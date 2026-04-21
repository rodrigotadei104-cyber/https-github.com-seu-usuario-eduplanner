import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSchedule } from '../context/ScheduleContext';
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

    React.useEffect(() => {
        if (!isOpen) return;

        const handleAuthCheck = async () => {
            const searchParams = new URLSearchParams(window.location.search);
            const code = searchParams.get('code');

            if (code) {
                console.log('Attempting to exchange code for session...');
                const { data, error } = await supabase.auth.exchangeCodeForSession(code);

                if (error) {
                    console.error('Error exchanging code:', error);
                    setError('O link expirou ou é inválido. Solicite um novo convite/recuperação.');
                    setWaitingForSession(false);
                    return;
                }

                if (data.session) {
                    console.log('Session established via code exchange');
                    setWaitingForSession(false);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    return;
                }
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setWaitingForSession(false);
                return;
            }

            if (type === 'recovery') {
                const hash = window.location.hash;
                const hashParams = new URLSearchParams(hash.substring(1));
                const accessToken = hashParams.get('access_token');

                if (accessToken) {
                    setRecoveryTokens({
                        access_token: accessToken,
                        refresh_token: hashParams.get('refresh_token') || ''
                    });
                    setWaitingForSession(false);
                    setError(null);
                    return;
                }
            }

            setWaitingForSession(false);
            if (type === 'invite' || type === 'recovery') {
                setError('Sessão não encontrada ou expirada. Use o link do e-mail novamente.');
            }
        };

        handleAuthCheck();
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

            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                const { error: updateError } = await supabase.auth.updateUser({ password: password });
                if (updateError) throw updateError;

                setSuccess(true);
                setTimeout(() => {
                    onClose();
                    window.location.hash = '';
                    if (type === 'recovery') window.location.reload();
                }, 2000);
                return;
            }

            let accessToken = recoveryTokens?.access_token;

            if (!accessToken) {
                const hash = window.location.hash;
                const hashParams = new URLSearchParams(hash.substring(1));
                accessToken = hashParams.get('access_token') || undefined;
            }

            if (!accessToken) {
                throw new Error('Sessão inválida e token não encontrado. Faça login novamente ou use o link do e-mail.');
            }

            const { data: result, error: fnError } = await supabase.functions.invoke('reset-password-secure', {
                body: {
                    accessToken: accessToken,
                    newPassword: password
                }
            });

            if (fnError) throw fnError;
            if (result?.error) throw new Error(result.error);

            setSuccess(true);
            setTimeout(() => {
                onClose();
                window.location.hash = '';
                window.location.reload();
            }, 2000);
            return;

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao definir senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-slate-700">
                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <div className="px-3 py-1 bg-black text-white text-[10px] font-black uppercase tracking-[0.3em] rounded">
                            [ SECURITY ]
                        </div>
                    </div>

                    <h2 className="text-xl font-black text-center text-gray-800 dark:text-white mb-2 uppercase tracking-tighter">
                        {type === 'invite' ? 'Bem-vindo ao EduPlanner' : 'Redefinir Senha'}
                    </h2>
                    <p className="text-center text-gray-400 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest mb-8">
                        {type === 'invite'
                            ? 'DEFINA SUA SENHA DE ACESSO PARA CONTINUAR'
                            : 'CRIE UMA NOVA SENHA PARA SUA CONTA'}
                    </p>

                    {waitingForSession ? (
                        <div className="flex flex-col items-center justify-center py-6">
                            <div className="text-[10px] font-black text-indigo-600 animate-pulse uppercase tracking-[0.3em]">
                                [ AGUARDE... VERIFICANDO ]
                            </div>
                        </div>
                    ) : success ? (
                        <div className="flex flex-col items-center justify-center py-6 text-emerald-600 animate-in fade-in">
                            <div className="text-sm font-black uppercase tracking-widest border-2 border-emerald-600 px-4 py-2 rounded-lg mb-2">
                                [ SENHA DEFINIDA ]
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                {type === 'recovery' ? 'REDIRECIONANDO LOGIN' : 'ENTRANDO NO SISTEMA'}
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nova Senha</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-600 outline-none transition font-black text-[12px] dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Confirmar Senha</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-indigo-600 outline-none transition font-black text-[12px] dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded flex items-center justify-center gap-2">
                                    [ ERR: {error} ]
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-black hover:bg-gray-900 text-white font-black py-4 rounded-lg transition-all uppercase tracking-[0.2em] text-[11px] shadow-lg disabled:opacity-50"
                            >
                                {loading ? '[ PROCESSANDO... ]' : '[ DEFINIR SENHA ]'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
