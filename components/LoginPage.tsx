import React, { useState } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { LogIn, Lock, Mail, Loader2, User, Sparkles, ArrowLeft, CheckCircle } from 'lucide-react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const LoginPage: React.FC = () => {
    // Toggle State: 'login' | 'activate' | 'forgot'
    const [authMode, setAuthMode] = useState<'login' | 'activate' | 'forgot'>('login');

    // Form Fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const { login, enterDemoMode, activateAccount, resetPassword } = useSchedule();

    // Detectar se veio de link de convite
    React.useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('mode=activate')) {
            setAuthMode('activate');
            // Limpar hash para URL mais limpa
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccessMsg('');

        // Basic Validation
        if (!email) {
            setError('Por favor, informe seu email.');
            setIsLoading(false);
            return;
        }

        if ((authMode === 'login' || authMode === 'activate') && !password) {
            setError('Por favor, informe a senha.');
            setIsLoading(false);
            return;
        }

        if (authMode === 'activate' && !name) {
            setError('Por favor, confirme seu nome.');
            setIsLoading(false);
            return;
        }

        try {
            if (authMode === 'activate') {
                await activateAccount(email, password, name);
                setAuthMode('login');
                setPassword('');
            } else if (authMode === 'forgot') {
                await resetPassword(email);
                setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
            } else {
                await login(email, password);
            }
        } catch (err: any) {
            let msg = 'Falha na operação.';
            if (err.message) msg = err.message;
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = (mode: 'login' | 'activate' | 'forgot') => {
        setAuthMode(mode);
        setError('');
        setSuccessMsg('');
        setPassword('');
        // Keep email if typed, nice UX
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 dark:bg-slate-900 transition-colors">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:bg-slate-800 dark:border-slate-700 animate-in fade-in zoom-in duration-300">

                {/* Header */}
                <div className="bg-blue-600 p-8 text-center transition-colors duration-300">
                    <div className="flex justify-center mb-4">
                        <EduPlannerLogo className="w-20 h-20 drop-shadow-md" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">EduPlanner</h1>
                    <p className="text-blue-100 text-sm">Sistema de Gestão Escolar Inteligente</p>
                </div>

                {/* Form */}
                <div className="p-8 relative">
                    {authMode !== 'login' && (
                        <button
                            onClick={() => handleToggle('login')}
                            className="absolute top-6 left-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-slate-700"
                            type="button"
                            title="Voltar para Login"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}

                    <div className="mb-6 text-center">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                            {authMode === 'login' && 'Acesso Restrito'}
                            {authMode === 'activate' && 'Ativar sua Conta'}
                            {authMode === 'forgot' && 'Recuperar Senha'}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1 dark:text-gray-400">
                            {authMode === 'login' && 'Entre com suas credenciais corporativas.'}
                            {authMode === 'activate' && 'Defina sua senha para acessar o convite.'}
                            {authMode === 'forgot' && 'Informe seu e-mail para receber o link.'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Activate Account Fields */}
                        {authMode === 'activate' && (
                            <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
                                <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900">
                                    Preencha o e-mail onde você recebeu o convite para validarmos seu acesso.
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Confirme seu Nome</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User size={18} className="text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            placeholder="Ex: Maria Silva"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Email {authMode === 'activate' ? 'do Convite' : 'Corporativo'}</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail size={18} className="text-gray-400" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        {authMode !== 'forgot' && (
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {authMode === 'login' ? 'Senha' : 'Crie sua Senha'}
                                    </label>
                                    {authMode === 'login' && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggle('forgot')}
                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline focus:outline-none dark:text-blue-400"
                                        >
                                            Esqueci minha senha
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock size={18} className="text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2 dark:bg-red-900/20 dark:text-red-300 animate-in fade-in duration-200">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-2"></div>
                                <span className="flex-1 leading-snug">{error}</span>
                            </div>
                        )}

                        {successMsg && (
                            <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-start gap-2 dark:bg-green-900/20 dark:text-green-300 animate-in fade-in duration-200">
                                <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                                <span className="flex-1 leading-snug">{successMsg}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {authMode === 'login' && 'Entrar'}
                                    {authMode === 'activate' && 'Ativar Conta'}
                                    {authMode === 'forgot' && 'Enviar Link'}

                                    {authMode === 'login' && <LogIn size={20} />}
                                    {authMode === 'activate' && <CheckCircle size={20} />}
                                    {authMode === 'forgot' && <Mail size={20} />}
                                </>
                            )}
                        </button>


                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700 text-center space-y-2">
                        {authMode === 'login' ? (
                            <>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Recebeu um convite por email?
                                    <button
                                        onClick={() => handleToggle('activate')}
                                        className="ml-1 text-blue-600 hover:text-blue-700 font-semibold hover:underline focus:outline-none dark:text-blue-400"
                                    >
                                        Ativar Conta
                                    </button>
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {authMode === 'forgot' ? 'Lembrou sua senha?' : 'Já possui conta?'}
                                <button
                                    onClick={() => handleToggle('login')}
                                    className="ml-1 text-blue-600 hover:text-blue-700 font-semibold hover:underline focus:outline-none dark:text-blue-400"
                                >
                                    Fazer Login
                                </button>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <p className="mt-8 text-gray-400 text-sm">
                © 2026 EduPlanner. Todos os direitos reservados.
            </p>
        </div>
    );
};