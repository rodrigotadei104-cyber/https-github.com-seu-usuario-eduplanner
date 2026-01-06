import React, { useState } from 'react';
import { LayoutDashboard, Calendar, CalendarDays, BarChart3, Plus, Settings, LogOut, Database, Shield, Building2, BookOpen } from 'lucide-react';
import { ViewMode } from '../types';
import { useSchedule } from '../context/ScheduleContext';
import { EduPlannerLogo } from './EduPlannerLogo';
import { ConfirmationModal } from './ConfirmationModal';

interface SidebarProps {
    currentView: ViewMode;
    onChangeView: (view: ViewMode) => void;
    onNewClass: () => void;
    onOpenSettings: () => void;
    isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onNewClass, onOpenSettings, isOpen }) => {
    const { logout, setFilters, userProfile, users } = useSchedule();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // Find Tenant Name either from user profile or from the active user list if stored there
    const tenantName = users.find(u => u.id === userProfile.id)?.tenantName || 'Minha Unidade';

    const isViewer = userProfile.role === 'viewer';
    const isAdmin = userProfile.role === 'admin';
    const isEditor = userProfile.role === 'editor';

    // Rule 2: "Criar aula": Admin ✅, Editor ✅
    const canCreateClass = isAdmin || isEditor;
    // Rule 6: "Acessar configurações": Todos podem acessar (mas com restrições dentro do modal)
    const canAccessSettings = true;

    const handleLogoutClick = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        logout();
        setShowLogoutConfirm(false);
    };

    const getRoleLabel = () => {
        switch (userProfile.role) {
            case 'admin': return 'Administrador';
            case 'editor': return 'Editor';
            case 'viewer': return 'Visualizador';
            default: return 'Visitante';
        }
    };

    return (
        <>
            <aside
                className={`
            fixed md:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out flex flex-col h-full
            ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            dark:bg-slate-800 dark:border-slate-700
        `}
            >
                <div className="flex flex-col h-full p-4">
                    {/* Branding */}
                    <div className="flex items-center gap-3 px-2 mb-2">
                        <EduPlannerLogo className="w-10 h-10 shadow-sm flex-shrink-0" />
                        <div className="overflow-hidden">
                            <span className="text-xl font-bold text-gray-800 tracking-tight dark:text-white block leading-tight">EduPlanner</span>
                        </div>
                    </div>

                    {/* Tenant Context Display */}
                    <div className="px-2 mb-4 mt-2">
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
                            <Building2 size={10} />
                            <span className="text-[10px] uppercase font-bold tracking-wider">Unidade</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate" title={tenantName}>
                            {tenantName}
                        </p>
                    </div>

                    {/* User Role Badge */}
                    <div className="px-2 mb-6 flex items-center gap-1.5">
                        <Shield size={12} className="text-gray-400" />
                        <span className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                            {getRoleLabel()}
                        </span>
                    </div>

                    {/* Action Button */}
                    {canCreateClass && (
                        <button
                            onClick={onNewClass}
                            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors shadow-sm mb-6"
                        >
                            <Plus size={20} />
                            <span>Nova Aula</span>
                        </button>
                    )}

                    {!canCreateClass && (
                        <div className="mb-6 px-2 py-3 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200 dark:bg-slate-700 dark:border-slate-600">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Modo de visualização apenas.</p>
                        </div>
                    )}

                    <nav className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
                        {/* 3. Agenda / Cronograma */}
                        <div className="px-2 mb-2 mt-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Agenda</p>
                            <div className="space-y-1">
                                <button
                                    onClick={() => { onChangeView('dashboard'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'dashboard' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    <LayoutDashboard size={18} /> Dashboard
                                </button>
                                <button
                                    onClick={() => { onChangeView('daily'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'daily' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    <Calendar size={18} /> Diário
                                </button>
                                <button
                                    onClick={() => { onChangeView('monthly'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'monthly' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    <CalendarDays size={18} /> Mensal
                                </button>
                                <button
                                    onClick={() => { onChangeView('annual'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'annual' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    <BarChart3 size={18} /> Anual
                                </button>
                            </div>
                        </div>

                        {/* 4. Gerenciamento Acadêmico */}
                        <div className="px-2 mb-2 mt-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Acadêmico</p>
                            <button
                                onClick={() => { onChangeView('registrations'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'registrations' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                            >
                                <BookOpen size={18} /> Cadastros
                            </button>
                        </div>

                        {/* 5. Gerenciamento de Usuários (Admin) */}
                        {isAdmin && (
                            <div className="px-2 mb-2 mt-4">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Administração</p>
                                <button
                                    onClick={() => { onChangeView('admin'); setFilters(prev => ({ ...prev, status: 'todos', search: '' })); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentView === 'admin' ? 'bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200'}`}
                                >
                                    <Shield size={18} /> Usuários & Logs
                                </button>
                            </div>
                        )}
                    </nav>

                    {/* 8. Configurações & Sair */}
                    <div className="border-t border-gray-100 pt-4 space-y-1 dark:border-slate-700 mt-2">
                        {canAccessSettings && (
                            <button
                                onClick={onOpenSettings}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200"
                            >
                                <Settings size={18} />
                                Configurações
                            </button>
                        )}
                        <button
                            onClick={handleLogoutClick}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        >
                            <LogOut size={18} />
                            Sair
                        </button>
                    </div>
                </div>
            </aside>

            <ConfirmationModal
                isOpen={showLogoutConfirm}
                title="Sair do EduPlanner"
                description="Tem certeza que deseja sair da sua conta?"
                onClose={() => setShowLogoutConfirm(false)}
                onConfirm={confirmLogout}
                confirmLabel="Sair"
                variant="danger"
            />
        </>
    );
};