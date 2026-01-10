import React, { useState } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { Shield, Users, FileText, Search, UserPlus, AlertCircle, Building2, Mail, Send, Clock, XCircle, Ban, CheckCircle, Filter, Trash2 } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { UserRole } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { Avatar } from './Avatar';

export const AdminPanel: React.FC = () => {
    const {
        userProfile, users, updateUserStatus, updateUserRole, createUser,
        systemLogs, resendInvitation, acceptInvitation, setTestPassword,
        deleteUser, isActionLoading
    } = useSchedule();
    const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
    const [searchTerm, setSearchTerm] = useState('');

    // New User Form State
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', role: 'viewer' as UserRole });

    // Log Filters
    const [logSearch, setLogSearch] = useState('');
    const [logActionFilter, setLogActionFilter] = useState<string>('all');
    const [logDateFilter, setLogDateFilter] = useState('');

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        description: '',
        action: () => { }
    });

    if (userProfile.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Shield size={48} className="text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Acesso Restrito</h2>
                <p className="text-gray-500 mt-2">Você não tem permissão para acessar esta área.</p>
            </div>
        );
    }

    const handleCreateUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (newUser.name && newUser.email) {
            createUser({
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            });
            setShowAddUser(false);
            setNewUser({ name: '', email: '', role: 'viewer' });
        }
    };

    const confirmDeactivation = (id: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Inativar usuário',
            description: 'O usuário perderá o acesso ao sistema imediatamente. Tem certeza que deseja continuar?',
            action: () => updateUserStatus(id, false)
        });
    };

    const confirmDeletion = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Excluir usuário permanentemente',
            description: `ATENÇÃO: Você está prestes a excluir ${name}. Esta ação remove o acesso e todos os dados vinculados, e NÃO PODE ser desfeita. Tem certeza absoluta?`,
            action: () => deleteUser(id)
        });
    };

    const confirmRoleChange = (id: string, newRole: UserRole) => {
        setConfirmModal({
            isOpen: true,
            title: 'Alterar perfil de usuário',
            description: `Você está alterando as permissões deste usuário para ${newRole.toUpperCase()}. Confirma esta alteração?`,
            action: () => updateUserRole(id, newRole)
        });
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredLogs = systemLogs.filter(log => {
        const matchesSearch =
            log.userName.toLowerCase().includes(logSearch.toLowerCase()) ||
            log.target.toLowerCase().includes(logSearch.toLowerCase()) ||
            log.details.toLowerCase().includes(logSearch.toLowerCase());

        const matchesAction = logActionFilter === 'all' ? true : log.action === logActionFilter;

        const matchesDate = logDateFilter ? isSameDay(new Date(log.timestamp), new Date(logDateFilter)) : true;

        return matchesSearch && matchesAction && matchesDate;
    });

    return (
        <>
            <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <Shield className="text-blue-600" />
                            Administração da Unidade
                        </h2>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <Building2 size={14} />
                            <span>ID do Tenant: <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1 rounded">{userProfile.tenantId}</span></span>
                        </div>
                    </div>
                </div>

                <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-3 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'users'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        <Users size={18} />
                        Equipe da Unidade
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`px-6 py-3 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'logs'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        <FileText size={18} />
                        Logs de Auditoria
                    </button>
                </div>

                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar usuário por nome ou email..."
                                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setShowAddUser(!showAddUser)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <UserPlus size={18} />
                                Convidar Membro
                            </button>
                        </div>

                        {/* Add User Form */}
                        {showAddUser && (
                            <form onSubmit={handleCreateUser} className="bg-gray-50 p-4 rounded-lg border border-gray-200 dark:bg-slate-800 dark:border-slate-700 animate-in fade-in slide-in-from-top-2">
                                <h3 className="font-semibold mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                                    <Mail size={18} className="text-gray-500" />
                                    Convidar Novo Usuário
                                </h3>
                                <p className="text-xs text-gray-500 mb-4 dark:text-gray-400">
                                    O usuário receberá um link seguro por e-mail para definir sua senha e ativar a conta.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Nome</label>
                                        <input required type="text" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
                                        <input required type="email" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Perfil</label>
                                        <select className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}>
                                            <option value="viewer">Visualizador</option>
                                            <option value="editor">Editor</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isActionLoading}
                                        className="bg-green-600 text-white p-2 rounded hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isActionLoading ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Send size={16} />
                                        )}
                                        {isActionLoading ? 'Enviando...' : 'Enviar Convite'}
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-slate-900/50 dark:border-slate-700">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Usuário</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Email</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Função</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Criado em</th>
                                        <th className="px-6 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {filteredUsers.map(u => {
                                        // Determine visual state based on logic
                                        const isInactive = !u.active;
                                        const isPending = u.active && u.invitationStatus === 'pending';
                                        const isActive = u.active && u.invitationStatus === 'accepted';

                                        return (
                                            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                                <td className="px-6 py-4 flex items-center gap-3">
                                                    <Avatar
                                                        name={u.name}
                                                        url={u.avatarUrl}
                                                        size="sm"
                                                        className={`border-2 ${isPending ? 'border-amber-200' : isInactive ? 'border-gray-200 grayscale' : 'border-blue-100'}`}
                                                    />
                                                    <div>
                                                        <div className={`font-medium ${isInactive ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                                            {u.name}
                                                            {u.id === userProfile.id && <span className="ml-2 text-xs text-gray-400">(Você)</span>}
                                                        </div>
                                                        {isPending && (
                                                            <span className="text-[10px] text-amber-600 flex items-center gap-1">
                                                                <Clock size={10} /> Aguardando aceite
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{u.email}</td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={u.role}
                                                        disabled={u.id === userProfile.id || isInactive || isActionLoading} // Cannot edit self or inactive
                                                        onChange={(e) => confirmRoleChange(u.id, e.target.value as UserRole)}
                                                        className="bg-transparent border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none dark:border-slate-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="viewer">Visualizador</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="admin">Administrador</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isInactive ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                            Inativo
                                                        </span>
                                                    ) : isPending ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                            Pendente
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                            Ativo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs dark:text-gray-400">
                                                    {format(new Date(u.createdAt), "dd/MM/yyyy")}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {u.id !== userProfile.id && (
                                                        <div className="flex justify-end gap-2">
                                                            {isPending && (
                                                                <>
                                                                    <button
                                                                        onClick={() => resendInvitation(u.id)}
                                                                        className="text-xs font-medium px-3 py-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                                                        title="Reenviar e-mail de convite"
                                                                    >
                                                                        Reenviar
                                                                    </button>
                                                                    {/* DEV/TEST: Simular aceite de convite */}
                                                                    <button
                                                                        onClick={() => acceptInvitation(u.id)}
                                                                        disabled={isActionLoading}
                                                                        className="text-xs font-medium px-3 py-1 rounded-md border border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 flex items-center gap-1 disabled:opacity-50"
                                                                        title="[DEV] Simular aceite de convite"
                                                                    >
                                                                        {isActionLoading ? <div className="w-3 h-3 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" /> : <CheckCircle size={12} />}
                                                                        Ativar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            const pwd = prompt('Defina a senha para este usuário (mínimo 6 caracteres):', '123456');
                                                                            if (pwd && pwd.length >= 6) {
                                                                                setTestPassword(u.id, pwd);
                                                                            } else if (pwd) {
                                                                                alert('A senha deve ter pelo menos 6 caracteres.');
                                                                            }
                                                                        }}
                                                                        className="text-xs font-medium px-3 py-1 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20 flex items-center gap-1"
                                                                        title="[DEV] Definir Credenciais de Acesso"
                                                                    >
                                                                        <Shield size={12} /> Definir Senha
                                                                    </button>
                                                                    <button
                                                                        onClick={() => confirmDeactivation(u.id)}
                                                                        className="text-xs font-medium px-2 py-1 text-red-500 hover:bg-red-50 rounded"
                                                                        title="Cancelar Convite (Inativar)"
                                                                    >
                                                                        <XCircle size={14} />
                                                                    </button>
                                                                </>
                                                            )}

                                                            {isActive && (
                                                                <button
                                                                    onClick={() => confirmDeactivation(u.id)}
                                                                    className="text-xs font-medium px-3 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-1"
                                                                    title="Bloquear acesso do usuário"
                                                                >
                                                                    <Ban size={12} /> Desativar
                                                                </button>
                                                            )}

                                                            {isInactive && (
                                                                <button
                                                                    onClick={() => updateUserStatus(u.id, true)}
                                                                    className="text-xs font-medium px-3 py-1 rounded-md border border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 flex items-center gap-1"
                                                                    title="Restaurar acesso"
                                                                >
                                                                    <CheckCircle size={12} /> Reativar
                                                                </button>
                                                            )}

                                                            <div className="w-px h-4 bg-gray-300 dark:bg-slate-600 mx-1"></div>

                                                            <button
                                                                onClick={() => confirmDeletion(u.id, u.name)}
                                                                className="text-xs font-medium px-2 py-1 text-red-500 hover:bg-red-50 hover:text-red-700 rounded transition-colors"
                                                                title="Excluir Usuário Permanentemente"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <div className="p-12 text-center flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                    <Users size={48} className="mb-2 opacity-20" />
                                    <p className="text-lg font-medium">Nenhum membro encontrado</p>
                                    <p className="text-sm">Tente ajustar sua busca ou convide um novo membro.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="space-y-6">
                        {/* Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar por usuário, ação..."
                                    className="pl-9 pr-4 py-2 w-full text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={logSearch}
                                    onChange={(e) => setLogSearch(e.target.value)}
                                />
                            </div>
                            <div>
                                <select
                                    className="w-full py-2 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={logActionFilter}
                                    onChange={(e) => setLogActionFilter(e.target.value)}
                                >
                                    <option value="all">Todas as Ações</option>
                                    <option value="CREATE">Criação (Create)</option>
                                    <option value="UPDATE">Edição (Update)</option>
                                    <option value="STATUS_CHANGE">Alteração de Status</option>
                                    <option value="DELETE">Exclusão (Delete)</option>
                                    <option value="USER_MGMT">Gestão de Usuários</option>
                                    <option value="INVITE">Convites</option>
                                    <option value="UNAUTHORIZED">Acesso Negado</option>
                                </select>
                            </div>
                            <div>
                                <input
                                    type="date"
                                    className="w-full py-2 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    value={logDateFilter}
                                    onChange={(e) => setLogDateFilter(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-end text-xs text-gray-500 dark:text-gray-400">
                                <Filter size={14} className="mr-1" />
                                Mostrando {filteredLogs.length} registros
                            </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden dark:bg-slate-800 dark:border-slate-700">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-slate-900/50 dark:border-slate-700">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Data/Hora</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Usuário</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Ação</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Entidade</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Detalhes</th>
                                        <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {filteredLogs.length > 0 ? (
                                        [...filteredLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                                <td className="px-6 py-4 text-gray-500 whitespace-nowrap dark:text-gray-400 text-xs">
                                                    {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm")}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900 dark:text-white">{log.userName}</div>
                                                    <div className="text-xs text-gray-500 uppercase">{log.userRole}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                                            ${log.action === 'CREATE' ? 'bg-green-100 text-green-700' : ''}
                                            ${log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' : ''}
                                            ${log.action === 'DELETE' ? 'bg-red-100 text-red-700' : ''}
                                            ${log.action === 'STATUS_CHANGE' ? 'bg-purple-100 text-purple-700' : ''}
                                            ${log.action === 'USER_MGMT' ? 'bg-orange-100 text-orange-700' : ''}
                                            ${log.action === 'LOGIN_FAIL' ? 'bg-gray-100 text-gray-700' : ''}
                                            ${log.action === 'INVITE' ? 'bg-teal-100 text-teal-700' : ''}
                                            ${log.action === 'UNAUTHORIZED' ? 'bg-red-50 text-red-600 border border-red-200' : ''}
                                        `}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-700 dark:text-gray-300 text-xs font-mono">{log.target}</td>
                                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{log.details}</td>
                                                <td className="px-6 py-4">
                                                    {log.status === 'success' ? (
                                                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                                            <CheckCircle size={14} /> Sucesso
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
                                                            <XCircle size={14} /> Falha
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                                    <FileText size={48} className="mb-2 opacity-20" />
                                                    <p className="text-lg font-medium">Nenhum registro encontrado</p>
                                                    <p className="text-sm text-gray-400">Não há atividades registradas com os filtros selecionados.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal Layer */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                description={confirmModal.description}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.action}
                variant="danger"
            />
        </>
    );
};