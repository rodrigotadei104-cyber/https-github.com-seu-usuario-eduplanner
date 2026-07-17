import React, { useState } from 'react';
import { ViewMode } from '../types';
import { useSchedule } from '../context/ScheduleContext';
import { ConfirmationModal } from './ConfirmationModal';

interface SidebarProps {
    currentView: ViewMode;
    onChangeView: (view: ViewMode) => void;
    onNewClass: () => void;
    onOpenSettings: () => void;
    isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onNewClass, onOpenSettings, isOpen }) => {
    const { logout, userProfile, users } = useSchedule();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const tenantName = users.find(u => u.id === userProfile.id)?.tenantName || 'Araraquara - SP';
    const isAdmin = userProfile.role === 'admin';
    const isEditor = userProfile.role === 'editor';
    const canCreateClass = isAdmin || isEditor;

    const handleLogoutClick = () => setShowLogoutConfirm(true);
    const confirmLogout = () => {
        logout();
        setShowLogoutConfirm(false);
    };

    const NavItem = ({ view, label }: { view: ViewMode, label: string }) => {
        const isActive = currentView === view;
        return (
            <button
                onClick={() => onChangeView(view)}
                className={`
                    w-full flex items-center px-4 py-2 rounded-xl text-[13px] transition-all duration-200 font-medium
                    ${isActive 
                        ? 'bg-[#222222] text-white shadow-sm' 
                        : 'text-zinc-500 hover:bg-[#1a1a1a] hover:text-zinc-200'}
                `}
            >
                <span className="flex-1 text-left">{label}</span>
            </button>
        );
    };

    const SectionTitle = ({ label }: { label: string }) => (
        <p className="px-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-5 mb-2">
            {label}
        </p>
    );

    return (
        <>
            <aside
                style={{ backgroundColor: '#121212' }}
                className={`
                    fixed md:static inset-y-0 left-0 z-40 w-[280px] border-r border-[#1a1a1a] transform transition-transform duration-300 ease-in-out flex flex-col h-full
                    ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
            >
                <div className="flex flex-col h-full p-6 overflow-hidden">
                    
                    {/* Logo EduPlanner */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 bg-[#2563eb] rounded-xl flex items-center justify-center text-white font-black text-xl tracking-tighter">E</div>
                        <span className="text-xl font-bold text-white tracking-tight">EduPlanner</span>
                    </div>

                    {/* Unidade Info */}
                    <div className="mb-5 px-2">
                         <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-1">Unidade</span>
                         <p className="text-[14px] font-medium text-zinc-200">{tenantName}</p>
                    </div>

                    {/* Card de Usuário Puro */}
                    <div className="mb-6 px-2">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full overflow-hidden bg-indigo-500 flex items-center justify-center text-white font-black text-[13px] uppercase shrink-0">
                                {userProfile.avatarUrl ? (
                                    <img 
                                        src={userProfile.avatarUrl} 
                                        alt={userProfile.name} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.name)}&background=random`;
                                        }}
                                    />
                                ) : (
                                    userProfile.avatarInitials
                                )}
                            </div>
                            <div className="flex flex-col min-w-0 justify-center">
                                <p className="text-[14px] font-medium text-zinc-100 truncate" title={userProfile.name}>
                                    {userProfile.name}
                                </p>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb] mt-0.5">
                                    {userProfile.role === 'admin' ? 'ADMINISTRADOR' : userProfile.role.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Botão + Nova Aula Azul Clássico */}
                    {canCreateClass && (
                        <button
                            onClick={onNewClass}
                            className="w-full bg-[#2563eb] hover:bg-blue-600 text-white py-3.5 rounded-xl font-bold text-[14px] transition-colors mb-6 active:scale-95"
                        >
                            + Aula Avulsa
                        </button>
                    )}

                    {/* Navegação Completa - Sem Ícones */}
                    <nav className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar pr-2">
                        <SectionTitle label="Agenda" />
                        <NavItem view="dashboard" label="Dashboard" />
                        <NavItem view="daily" label="Diário" />
                        <NavItem view="monthly" label="Mensal" />
                        <NavItem view="annual" label="Anual" />
                        <NavItem view="room-map" label="Mapa de Salas" />
                        <NavItem view="instructor-map" label="Mapa de Instrutores" />

                        <SectionTitle label="Acadêmico" />
                        <NavItem view="jovem-aprendiz" label="Jovem Aprendiz" />
                        <NavItem view="catalog" label="Catálogo Base" />
                        <NavItem view="calendar" label="Calendário Institucional" />
                        <NavItem view="registrations" label="Cadastros Rápidos" />
                        
                        {isAdmin && (
                            <>
                                <SectionTitle label="Administração" />
                                <NavItem view="admin" label="Usuários e Logs" />
                            </>
                        )}

                        <SectionTitle label="Sistema" />
                        <NavItem view="settings" label="Configurações" />
                        <NavItem view="privacy" label="Políticas de Privacidade" />
                        <NavItem view="terms" label="Termos de Uso" />
                        <NavItem view="about" label="Sobre o App" />
                    </nav>

                    {/* Footer Clássico */}
                    <div className="pt-4 border-t border-[#1a1a1a] mt-2">
                        <button
                            onClick={handleLogoutClick}
                            className="w-full text-left px-4 py-2 text-[12px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </aside>

            <ConfirmationModal
                isOpen={showLogoutConfirm}
                title="Sair do EduPlanner"
                description="Tem certeza que deseja encerrar sua sessão?"
                onClose={() => setShowLogoutConfirm(false)}
                onConfirm={confirmLogout}
                confirmLabel="SAIR"
                variant="danger"
            />
        </>
    );
};