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
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportAulasToCSV } from './utils/export';
import { startOfMonth, endOfMonth } from 'date-fns';
import { aulaService } from './services/aula.service';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfUse } from './components/TermsOfUse';
import { AboutPage } from './components/AboutPage';
import { DataInspector } from './components/DataInspector';
import { AberturaTurmaWizard } from './components/AberturaTurmaWizard';
import { RoomMapView } from './components/RoomMapView';
import { CatalogoView } from './components/CatalogoView';
import { CalendarioInstitucionalView } from './components/CalendarioInstitucionalView';
import { JovemAprendizView } from './components/JovemAprendizView';

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
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

    // DEBUG: Log State
    React.useEffect(() => {
        console.log('[DEBUG] App State:', {
            currentDate: format(currentDate, 'yyyy-MM-dd'),
            viewMode,
            totalAulas: aulas.length,
            filteredAulas: filteredAulas.length,
            firstFiltered: filteredAulas[0],
            filters
        });
    }, [currentDate, viewMode, aulas, filteredAulas, filters]);



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

    // Rota Estática para Política de Privacidade
    if (window.location.pathname === '/privacy') {
        return <PrivacyPolicy />;
    }

    // Rota Estática para Termos de Uso
    if (window.location.pathname === '/terms') {
        return <TermsOfUse />;
    }

    // Rota Estática para Sobre o App
    if (window.location.pathname === '/about') {
        return <AboutPage />;
    }

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
    const isEditor = userProfile.role === 'editor';
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
        if (viewMode === 'room-map') return 'Mapa de Salas';
        if (viewMode === 'catalog') return 'Catálogo Base';
        if (viewMode === 'calendar') return 'Calendário Instit.';
        if (viewMode === 'jovem-aprendiz') return 'Jovem Aprendiz';
        if (viewMode === 'privacy') return 'Políticas de Privacidade';
        if (viewMode === 'terms') return 'Termos de Uso';
        if (viewMode === 'about') return 'Sobre o App';
        if (viewMode === 'settings') return 'Configurações do Sistema';
        return format(currentDate, "dd 'de' MMMM", { locale: ptBR });
    };

    const handlePrint = () => {
        window.print();
    };

    const showNavControls = viewMode !== 'registrations' && viewMode !== 'admin' && viewMode !== 'room-map' && viewMode !== 'catalog' && viewMode !== 'calendar' && viewMode !== 'jovem-aprendiz';
    const showSearchBar = showNavControls && viewMode !== 'dashboard'; // Hide search in dashboard

    const handleExportMonth = async () => {
        if (!currentDate) return;

        try {
            // Calcular range do mês atual
            const startStr = startOfMonth(currentDate).toISOString();
            const endStr = endOfMonth(currentDate).toISOString();

            // Buscar dados completos (com relações)
            const exportData = await aulaService.list({
                dateFrom: startStr,
                dateTo: endStr,
                includeRelations: true
            });

            const fileName = `EduPlanner_Aulas_${format(currentDate, 'MM_yyyy')}`;
            exportAulasToCSV(exportData as any[], fileName);

        } catch (error) {
            console.error('Erro ao exportar:', error);
        }
    };

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
                return <RegistrationView />;
            case 'catalog': // Nova Arquitetura
                if (!isAdmin) return <AccessDenied onNavigateBack={() => setViewMode('dashboard')} />;
                return <CatalogoView />;
            case 'calendar': // Nova Arquitetura
                if (!isAdmin) return <AccessDenied onNavigateBack={() => setViewMode('dashboard')} />;
                return <CalendarioInstitucionalView />;
            case 'jovem-aprendiz': // Programas Paralelos
                // Admin e Editor podem editar; Viewer tem acesso somente leitura
                if (!isAdmin && !isEditor && userProfile.role !== 'viewer') return <AccessDenied onNavigateBack={() => setViewMode('dashboard')} />;
                return <JovemAprendizView readOnly={!isAdmin && !isEditor} />;
            case 'admin': // 5. Gerenciamento de Usuários & 7. Logs
                // STRICT PERMISSION CHECK
                if (!canViewAdminPanel) {
                    return <AccessDenied onNavigateBack={() => setViewMode('dashboard')} />;
                }
                return <AdminPanel />;
            case 'room-map': // Mapa de Salas — visão semanal por sala
                return (
                    <RoomMapView
                        onEditAula={handleEditAula}
                    />
                );
            case 'privacy':
                return <PrivacyPolicy />;
            case 'terms':
                return <TermsOfUse />;
            case 'about':
                return <AboutPage />;
            case 'settings':
                return <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-xl font-bold mb-4">Configurações</h2>
                    <p className="text-slate-500">As configurações detalhadas podem ser acessadas pelo modal de perfil ou através deste painel em breve.</p>
                    <button onClick={() => setIsSettingsOpen(true)} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Abrir Modal de Configurações</button>
                </div>;
            default:
                return (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                        <span className="text-6xl font-black opacity-10">404</span>
                        <p className="text-sm font-bold uppercase tracking-widest">Tela não implementada ou em construção</p>
                        <button onClick={() => setViewMode('dashboard')} className="text-blue-600 font-bold hover:underline">Voltar ao Dashboard</button>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans selection:bg-blue-100 dark:bg-slate-950 transition-colors">
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

            {/* Main Operational Surface */}
            <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden bg-white dark:bg-slate-950">

                {/* Minimalist Notification */}
                {notification && (
                    <div className="absolute top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className={`
                            flex items-center gap-4 px-6 py-4 rounded-xl shadow-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800
                        `}>
                            <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : notification.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{notification.message}</span>
                            <button onClick={closeNotification} className="ml-4 text-slate-400 hover:text-slate-600 font-bold text-xs">
                                FECHAR
                            </button>
                        </div>
                    </div>
                )}

                {/* Header: Clean Functional Toolbar */}
                <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 z-30 transition-all dark:bg-slate-900 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="md:hidden p-2 text-slate-900 font-bold dark:text-white"
                        >
                            MENU
                        </button>

                        {showNavControls && (
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden dark:border-slate-700">
                                <button
                                    onClick={() => handleNavigate('prev')}
                                    className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 font-bold transition-all dark:text-white border-r border-slate-200 dark:border-slate-700"
                                >
                                    ‹
                                </button>
                                <div className="px-5 flex items-center h-9 bg-white dark:bg-slate-900">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                        {getDateLabel()}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleNavigate('next')}
                                    className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 font-bold transition-all dark:text-white border-l border-slate-200 dark:border-slate-700"
                                >
                                    ›
                                </button>
                            </div>
                        )}

                        {!showNavControls && (
                            <h1 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                                {getDateLabel()}
                            </h1>
                        )}

                        {showNavControls && (
                            <button
                                onClick={() => setCurrentDate(new Date())}
                                className="hidden lg:block text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-900 px-3 py-1.5 transition-colors"
                            >
                                Hoje
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Primary Action Clássico: Agente Criador Roxo */}
                        <button
                            onClick={() => setIsGeneratorOpen(true)}
                            className="hidden sm:flex items-center bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md shadow-indigo-200 dark:shadow-none"
                        >
                            Agente Criador
                        </button>

                        {/* Minimalist Search */}
                        {showSearchBar && (
                            <div className="hidden xl:flex items-center bg-slate-50 rounded-lg px-3 py-2 w-64 border border-slate-200 focus-within:border-slate-400 focus-within:bg-white transition-all dark:bg-slate-800 dark:border-slate-700">
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="bg-transparent border-none outline-none text-xs font-medium w-full text-slate-900 placeholder-slate-400 dark:text-white"
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                        )}

                        <div className="flex items-center gap-3 pl-4 border-l border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">
                                {userProfile.name?.split(' ')[0]}
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center font-bold text-xs border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                                {userProfile.avatarInitials}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                {viewMode === 'jovem-aprendiz' ? (
                    /* Views com scroll interno próprio (Excel-like) — sem padding/overflow do main */
                    <main className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-950">
                        {renderContent()}
                    </main>
                ) : (
                    <main className="flex-1 min-h-0 overflow-y-auto p-8 sm:p-10 bg-slate-50 dark:bg-slate-950">
                        <div className="max-w-[1500px] w-full mx-auto">
                            {renderContent()}
                        </div>
                    </main>
                )}
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

            <DataInspector isOpen={isInspectorOpen} onClose={() => setIsInspectorOpen(false)} />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <SetPasswordModal
                isOpen={passwordModal.isOpen}
                onClose={() => setPasswordModal({ ...passwordModal, isOpen: false })}
                type={passwordModal.type}
            />

            <AberturaTurmaWizard
                isOpen={isGeneratorOpen}
                onClose={() => setIsGeneratorOpen(false)}
            />
        </div>
    );
};

export default App;