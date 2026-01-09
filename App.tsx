import React, { useState } from 'react';
import { useSchedule } from './context/ScheduleContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { DailyView } from './components/DailyView';
import { MonthlyView } from './components/MonthlyView';
import { RegistrationView } from './components/RegistrationView';
import { ClassModal } from './components/ClassModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { AdminPanel } from './components/AdminPanel';
import { AccessDenied } from './components/AccessDenied';
import { SetPasswordModal } from './components/SetPasswordModal';
import { supabase } from './lib/supabase';
import { Aula, ViewMode } from './types';
import {
    ChevronLeft,
    ChevronRight,
    Search,
    Menu,
    Download,
    Filter,
    Printer,
    CheckCircle,
    AlertTriangle,
    Info,
    X
} from 'lucide-react';
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const App: React.FC = () => {
    const {
        isAuthenticated,
        viewMode,
        setViewMode,
        currentDate,
        setCurrentDate,
        filteredAulas,
        stats,
        aulas,
        addAula,
        updateAula,
        deleteAula,
        filters,
        setFilters,
        userProfile,
        notification,
        closeNotification
    } = useSchedule();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; type: 'invite' | 'recovery' }>({ isOpen: false, type: 'invite' });
    const [editingAula, setEditingAula] = useState<Aula | null>(null);

    // 0. Listener para Invite/Recovery Links (Supabase Auth)
    React.useEffect(() => {
        // Verificação manual do hash (backup caso evento não dispare)
        const checkUrlForRecovery = () => {
            const hash = window.location.hash;
            const searchParams = new URLSearchParams(window.location.search);
            const code = searchParams.get('code');

            console.log('Checking URL:', { hash, code });

            if (code) {
                // PKCE Flow detected
                console.log('Auth code detected in URL');
                // We don't know if it's recovery or invite just from code, 
                // but usually recovery/invite flows end up here. 
                // We'll let the onAuthStateChange handle the event type, 
                // but we might want to show the modal in a "loading" state or wait.
                // However, often the type is also in query params if we put it there? 
                // Supabase adds type=recovery in the redirect URL for implicit, 
                // for PKCE it might be different. 
                // Let's rely on onAuthStateChange for the specific type, OR default to recovery/invite if we can infer.
                // Usually for invites/recovery we want to ensure the user sets a password.
                // We'll trust the session establishment event.
            }

            if (hash.includes('type=recovery')) {
                console.log('Recovery link detected in hash!');
                setPasswordModal({ isOpen: true, type: 'recovery' });
            } else if (hash.includes('type=invite')) {
                console.log('Invite link detected in hash!');
                setPasswordModal({ isOpen: true, type: 'invite' });
            }
        };

        // Verificar imediatamente
        checkUrlForRecovery();

        // Listener de eventos do Supabase
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth State Change:', event, 'Has Session:', !!session);

            // PASSWORD_RECOVERY é disparado quando usuário clica em link de recovery
            if (event === 'PASSWORD_RECOVERY') {
                console.log('PASSWORD_RECOVERY event fired!');
                setPasswordModal({ isOpen: true, type: 'recovery' });
            }
            // Para invites, precisamos verificar quando uma sessão é criada
            else if (session && !passwordModal.isOpen) {
                checkUrlForRecovery();
            }
        });

        // Escutar mudanças no hash
        window.addEventListener('hashchange', checkUrlForRecovery);

        return () => {
            subscription.unsubscribe();
            window.removeEventListener('hashchange', checkUrlForRecovery);
        };
    }, [passwordModal.isOpen]);

    // 1. Telas Públicas: Se não autenticado, força Login
    if (!isAuthenticated) {
        return (
            <>
                <LoginPage />
                {/* Mostrar modal de senha mesmo não logado (para recovery/invite) */}
                <SetPasswordModal
                    isOpen={passwordModal.isOpen}
                    onClose={() => setPasswordModal({ isOpen: false, type: 'invite' })}
                    type={passwordModal.type}
                />
            </>
        );
    }

    // Permission Checks based on Screen Map
    const isAdmin = userProfile.role === 'admin';
    const canViewAdminPanel = isAdmin; // Only Admin can see User Management/Logs

    // Registration View (Academic Management): Admin and Editor (maybe) usually just Admin for creating structure
    // Based on prompt "4.1/4.2/4.3 Criar/Editar (Admin)", Viewers can likely LIST.
    // We will allow access but the component handles inner write permissions.

    const handleNavigate = (direction: 'prev' | 'next') => {
        switch (viewMode) {
            case 'daily':
                setCurrentDate(direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1));
                break;
            case 'monthly':
            case 'dashboard': // Dashboard navigates months for chart context
                setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
                break;
            case 'annual':
                setCurrentDate(direction === 'next' ? addYears(currentDate, 1) : subYears(currentDate, 1));
                break;
        }
    };

    const handleEditAula = (aula: Aula) => {
        setEditingAula(aula);
        setIsModalOpen(true);
    };

    const handleSaveAula = (aulaData: Omit<Aula, 'id'> | Aula) => {
        if ('id' in aulaData) {
            updateAula(aulaData);
        } else {
            addAula(aulaData);
            if (filters.status !== 'todos') {
                setFilters(prev => ({ ...prev, status: 'todos' }));
            }
        }
    };

    const handleNewClass = () => {
        setEditingAula(null);
        setIsModalOpen(true);
    };

    const handleDateSelection = (date: Date) => {
        setCurrentDate(date);
        setViewMode('daily');
    }

    const getDateLabel = () => {
        if (viewMode === 'annual') return format(currentDate, 'yyyy');
        if (viewMode === 'monthly' || viewMode === 'dashboard') return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
        if (viewMode === 'registrations') return 'Gestão Acadêmica';
        if (viewMode === 'admin') return 'Gestão de Usuários & Logs';
        return format(currentDate, "dd 'de' MMMM", { locale: ptBR });
    };

    const handlePrint = () => {
        window.print();
    };

    const showNavControls = viewMode !== 'registrations' && viewMode !== 'admin';

    // --- ROUTER LOGIC (Screen Map Implementation) ---
    const renderContent = () => {
        switch (viewMode) {
            case 'dashboard':
            case 'annual': // Dashboard/Stats View
                return (
                    <Dashboard
                        stats={stats}
                        allAulas={aulas}
                        currentDate={currentDate}
                        onNavigateToMonth={(date) => {
                            setCurrentDate(date);
                            setViewMode('monthly');
                        }}
                    />
                );
            case 'daily': // 3.2 Visão Diária
                return (
                    <DailyView
                        currentDate={currentDate}
                        aulas={filteredAulas}
                        onEdit={handleEditAula}
                    />
                );
            case 'monthly': // 3.1 Visão Mensal
                return (
                    <MonthlyView
                        currentDate={currentDate}
                        aulas={filteredAulas}
                        onSelectDate={handleDateSelection}
                        onEditAula={handleEditAula}
                    />
                );
            case 'registrations': // 4. Gerenciamento Acadêmico
                // All authenticated users can technically view this list, but only Admin edits.
                // If strict requirements say Viewers can't even see the list, add check here.
                return <RegistrationView />;
            case 'admin': // 5. Gerenciamento de Usuários & 7. Logs
                // STRICT PERMISSION CHECK
                if (!canViewAdminPanel) {
                    return <AccessDenied onNavigateBack={() => setViewMode('dashboard')} />;
                }
                return <AdminPanel />;
            default:
                return (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        Tela não encontrada (404)
                    </div>
                );
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans transition-colors dark:bg-slate-900">
            <Sidebar
                currentView={viewMode}
                onChangeView={(view) => {
                    setViewMode(view);
                    setIsSidebarOpen(false);
                }}
                onNewClass={handleNewClass}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isOpen={isSidebarOpen}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full w-full relative">

                {/* Toast Notification */}
                {notification && (
                    <div className="absolute top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
                        <div className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border
                    ${notification.type === 'success' ? 'bg-white border-green-200 text-green-800 dark:bg-slate-800 dark:border-green-900 dark:text-green-300' : ''}
                    ${notification.type === 'error' ? 'bg-white border-red-200 text-red-800 dark:bg-slate-800 dark:border-red-900 dark:text-red-300' : ''}
                    ${notification.type === 'info' ? 'bg-white border-blue-200 text-blue-800 dark:bg-slate-800 dark:border-blue-900 dark:text-blue-300' : ''}
                `}>
                            {notification.type === 'success' && <CheckCircle size={20} className="text-green-500" />}
                            {notification.type === 'error' && <AlertTriangle size={20} className="text-red-500" />}
                            {notification.type === 'info' && <Info size={20} className="text-blue-500" />}

                            <span className="font-medium text-sm">{notification.message}</span>

                            <button onClick={closeNotification} className="ml-2 hover:opacity-70">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 z-10 transition-colors dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-slate-700"
                        >
                            <Menu size={24} />
                        </button>

                        {showNavControls && (
                            <div className="flex items-center bg-gray-100 rounded-lg p-1 dark:bg-slate-700">
                                <button
                                    onClick={() => handleNavigate('prev')}
                                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-600 transition-all dark:text-gray-300 dark:hover:bg-slate-600"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="w-40 text-center font-semibold text-gray-700 capitalize text-sm sm:text-base dark:text-gray-200">
                                    {getDateLabel()}
                                </span>
                                <button
                                    onClick={() => handleNavigate('next')}
                                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-600 transition-all dark:text-gray-300 dark:hover:bg-slate-600"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}

                        {!showNavControls && (
                            <h1 className="text-lg font-bold text-gray-800 dark:text-white ml-2">
                                {getDateLabel()}
                            </h1>
                        )}

                        {showNavControls && (
                            <button
                                onClick={() => setCurrentDate(new Date())}
                                className="hidden sm:block text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-md hover:bg-blue-50 transition dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                            >
                                Hoje
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search Bar */}
                        {showNavControls && (
                            <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-2 w-64 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all dark:bg-slate-700 dark:focus-within:bg-slate-600 dark:focus-within:border-blue-500">
                                <Search size={18} className="text-gray-400 dark:text-gray-300" />
                                <input
                                    type="text"
                                    placeholder="Buscar aula, instrutor..."
                                    className="bg-transparent border-none outline-none text-sm ml-2 w-full text-gray-700 placeholder-gray-400 dark:text-gray-200 dark:placeholder-gray-500"
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                        )}

                        {showNavControls && (
                            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg md:hidden dark:text-gray-300 dark:hover:bg-slate-700">
                                <Search size={20} />
                            </button>
                        )}

                        {viewMode === 'daily' && (
                            <button
                                onClick={handlePrint}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-slate-700"
                                title="Imprimir Diário"
                            >
                                <Printer size={20} />
                            </button>
                        )}

                        {showNavControls && (
                            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg hidden sm:block dark:text-gray-300 dark:hover:bg-slate-700">
                                <Filter size={20} />
                            </button>
                        )}

                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800">
                            {userProfile.avatarInitials}
                        </div>
                    </div>
                </header>

                {/* View Content (Router Output) */}
                <main className="flex-1 overflow-hidden p-4 sm:p-6 relative dark:bg-slate-900">
                    {renderContent()}
                </main>
            </div>

            <ClassModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingAula(null);
                }}
                onSave={handleSaveAula}
                initialData={editingAula}
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <SetPasswordModal
                isOpen={passwordModal.isOpen}
                onClose={() => setPasswordModal({ ...passwordModal, isOpen: false })}
                type={passwordModal.type}
            />
        </div>
    );
};

export default App;