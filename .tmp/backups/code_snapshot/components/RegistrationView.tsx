import React, { useState } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { Trash2, Plus, User, BookOpen, GraduationCap, Lock, Pencil, X, Calendar, Upload } from 'lucide-react';
import { Instrutor, Curso, Materia, EventType, EventStatus } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { ImportModal } from './ImportModal';

type Tab = 'instrutores' | 'cursos' | 'materias' | 'eventos';

export const RegistrationView: React.FC = () => {
    const {
        instrutores, addInstrutor, deleteInstrutor,
        cursos, addCurso, updateCurso, deleteCurso,
        materias, addMateria, deleteMateria,
        eventos, addEvento, updateEvento, deleteEvento,
        userProfile, canManageRegistrations, isActionLoading
    } = useSchedule();

    const [activeTab, setActiveTab] = useState<Tab>('instrutores');

    const canManage = canManageRegistrations();
    const isReadOnly = !canManage;

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        description: '',
        action: () => { }
    });

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        telefone: '',
        cargaHoraria: '',
        cor: '#3b82f6',
        cursoId: '',
        minutosPorHora: '60',
        numeroCurso: '',
        status: 'agendado' as EventStatus | 'ativo',
        // Event Fields
        tipo: 'outro' as EventType,
        data: new Date().toISOString().split('T')[0],
        horarioInicio: '',
        horarioFim: '',
        instrutorId: '',
        sala: ''
    });

    // Edit State
    const [editingItem, setEditingItem] = useState<{ id: string, type: Tab } | null>(null);

    const resetForm = () => {
        setFormData({
            nome: '',
            email: '',
            telefone: '',
            cargaHoraria: '',
            cor: '#3b82f6',
            cursoId: '',
            minutosPorHora: '60',
            numeroCurso: '',
            status: 'agendado',
            tipo: 'outro',
            data: new Date().toISOString().split('T')[0],
            horarioInicio: '',
            horarioFim: '',
            instrutorId: '',
            sala: ''
        });
    };

    const handleEdit = (item: any, type: Tab) => {
        setEditingItem({ id: item.id, type });
        setFormData({
            nome: item.nome,
            email: item.email || '',
            telefone: item.telefone || '',
            cargaHoraria: item.cargaHoraria || '',
            cor: item.cor || '#3b82f6',
            cursoId: item.cursoId || '',
            minutosPorHora: String(item.minutosPorHora || (item as any).minutos_por_hora || 60),
            numeroCurso: item.numeroCurso || '',
            status: item.status || 'agendado',
            tipo: item.tipo || 'outro',
            data: item.data ? (item.data instanceof Date ? item.data.toISOString().split('T')[0] : item.data) : '',
            horarioInicio: item.horarioInicio || '',
            horarioFim: item.horarioFim || '',
            instrutorId: item.instrutorId || '',
            sala: item.sala || ''
        });
        // Scroll to top to see form
        const formElement = document.querySelector('form');
        if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingItem(null);
        resetForm();
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) return;
        if (!formData.nome.trim()) return;

        if (editingItem) {
            if (activeTab === 'cursos') {
                await updateCurso(editingItem.id, {
                    nome: formData.nome,
                    cargaHoraria: formData.cargaHoraria,
                    cor: formData.cor,
                    minutosPorHora: Number(formData.minutosPorHora),
                    numeroCurso: formData.numeroCurso,
                    status: formData.status as 'ativo' | 'concluido'
                });
            } else if (activeTab === 'eventos') {
                await updateEvento(editingItem.id, {
                    nome: formData.nome,
                    tipo: formData.tipo,
                    data: formData.data,
                    horario_inicio: formData.horarioInicio,
                    horario_fim: formData.horarioFim,
                    instrutor_id: formData.instrutorId || undefined,
                    sala: formData.sala,
                    status: formData.status as EventStatus
                });
            }
            // Add others if needed
            setEditingItem(null);
        } else {
            if (activeTab === 'instrutores') {
                addInstrutor({
                    nome: formData.nome,
                    email: formData.email,
                    telefone: formData.telefone
                });
            } else if (activeTab === 'cursos') {
                addCurso({
                    nome: formData.nome,
                    cor: formData.cor,
                    cargaHoraria: formData.cargaHoraria,
                    minutosPorHora: Number(formData.minutosPorHora),
                    numeroCurso: formData.numeroCurso,
                    status: 'ativo'
                });
            } else if (activeTab === 'materias') {
                if (!formData.cursoId) return;
                addMateria({
                    nome: formData.nome,
                    cursoId: formData.cursoId,
                    cargaHoraria: formData.cargaHoraria ? Number(formData.cargaHoraria.replace(/\D/g, '')) : undefined
                });
            } else if (activeTab === 'eventos') {
                await addEvento({
                    nome: formData.nome,
                    tipo: formData.tipo,
                    data: formData.data,
                    horario_inicio: formData.horarioInicio,
                    horario_fim: formData.horarioFim,
                    instrutor_id: formData.instrutorId || undefined,
                    sala: formData.sala,
                    status: 'agendado'
                });
            }
        }
        resetForm();
    };

    const handleDelete = (id: string, type: 'instrutor' | 'curso' | 'materia' | 'evento') => {
        setConfirmModal({
            isOpen: true,
            title: 'Excluir registro',
            description: 'Tem certeza que deseja excluir este registro? Esta ação é irreversível.',
            action: () => {
                if (type === 'instrutor') deleteInstrutor(id);
                if (type === 'curso') deleteCurso(id);
                if (type === 'materia') deleteMateria(id);
                if (type === 'evento') deleteEvento(id);
            }
        });
    };

    const tabs = [
        { id: 'instrutores', label: 'Instrutores', icon: User, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
        { id: 'cursos', label: 'Cursos', icon: GraduationCap, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
        { id: 'materias', label: 'Matérias', icon: BookOpen, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
        { id: 'eventos', label: 'Eventos', icon: Calendar, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    ];

    return (
        <>
            <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Cadastros</h2>
                    {isReadOnly && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg border border-amber-100">
                            <Lock size={14} />
                            Apenas Leitura (Viewer)
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-8">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id as Tab); resetForm(); }}
                                className={`
                        flex items-center gap-3 px-6 py-4 rounded-xl border transition-all duration-200
                        ${isActive
                                        ? 'bg-white border-blue-200 shadow-md transform scale-105 dark:bg-slate-800 dark:border-blue-700'
                                        : 'bg-gray-50 border-transparent hover:bg-white hover:shadow-sm text-gray-500 dark:bg-slate-800/50 dark:text-gray-400 dark:hover:bg-slate-800'}
                    `}
                            >
                                <div className={`p-2 rounded-lg ${tab.bg} ${tab.color}`}>
                                    <Icon size={24} />
                                </div>
                                <span className={`font-semibold ${isActive ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-slate-800 dark:border-slate-700">
                    {/* Add/Edit Form (HIDDEN for Readers) */}
                    {canManage && (
                        <div className="mb-8">
                            {activeTab === 'cursos' && !editingItem && (
                                <div className="flex justify-end mb-4">
                                    <button
                                        onClick={() => setIsImportModalOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                                    >
                                        <Upload size={16} />
                                        Importar Excel / CSV
                                    </button>
                                </div>
                            )}

                            <form onSubmit={handleSave} className={`p-6 rounded-lg border ${editingItem ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20' : 'bg-gray-50 border-gray-100 dark:bg-slate-900/50 dark:border-slate-700'}`}>
                                {editingItem && (
                                    <div className="mb-4 flex justify-between items-center text-blue-700 dark:text-blue-300">
                                        <span className="text-sm font-semibold flex items-center gap-2">
                                            <Pencil size={16} /> Editando {activeTab === 'cursos' ? 'Curso' : 'Item'}
                                        </span>
                                        <button type="button" onClick={cancelEdit} className="text-xs hover:underline flex items-center gap-1">
                                            <X size={14} /> Cancelar
                                        </button>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                                            Nome {activeTab === 'instrutores' ? 'do Instrutor' : activeTab === 'cursos' ? 'do Curso' : activeTab === 'eventos' ? 'do Evento' : 'da Matéria'}
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                            placeholder="Digite o nome..."
                                            value={formData.nome}
                                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                            required
                                            disabled={isActionLoading}
                                        />
                                    </div>
                                    {activeTab === 'cursos' && (
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                                                Número do Curso
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                placeholder="Ex: 1001"
                                                value={formData.numeroCurso}
                                                onChange={(e) => setFormData({ ...formData, numeroCurso: e.target.value })}
                                                disabled={isActionLoading}
                                            />
                                        </div>
                                    )}

                                    {activeTab === 'instrutores' && (
                                        <>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Email</label>
                                                <input
                                                    type="email"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    placeholder="email@exemplo.com"
                                                    value={formData.email}
                                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                    disabled={isActionLoading}
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Telefone</label>
                                                <input
                                                    type="tel"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    placeholder="(00) 00000-0000"
                                                    value={formData.telefone}
                                                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                                                    disabled={isActionLoading}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {activeTab === 'cursos' && (
                                        <>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Carga Horária</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    placeholder="Ex: 3600h"
                                                    value={formData.cargaHoraria}
                                                    onChange={(e) => setFormData({ ...formData, cargaHoraria: e.target.value })}
                                                    disabled={isActionLoading}
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Tipo de Hora</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="30"
                                                        step="1"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                        placeholder="Ex: 60"
                                                        value={formData.minutosPorHora}
                                                        onChange={(e) => setFormData({ ...formData, minutosPorHora: e.target.value })}
                                                        disabled={isActionLoading}
                                                    />
                                                    <span className="absolute right-8 top-2.5 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">minutos</span>
                                                </div>
                                            </div>
                                            <div className="w-full">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Cor</label>
                                                <div className="flex gap-2 items-center h-[42px]">
                                                    <input
                                                        type="color"
                                                        className="h-full w-full rounded cursor-pointer border border-gray-300 dark:border-slate-600 disabled:opacity-50"
                                                        value={formData.cor}
                                                        onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                                                        disabled={isActionLoading}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {activeTab === 'materias' && (
                                        <>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Curso Vinculado</label>
                                                <select
                                                    required
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.cursoId}
                                                    onChange={(e) => setFormData({ ...formData, cursoId: e.target.value })}
                                                    disabled={isActionLoading}
                                                >
                                                    <option value="">Selecione um curso...</option>
                                                    {cursos.map(c => (
                                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Carga Horária</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    placeholder="Ex: 60h"
                                                    value={formData.cargaHoraria}
                                                    onChange={(e) => setFormData({ ...formData, cargaHoraria: e.target.value })}
                                                    disabled={isActionLoading}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {activeTab === 'eventos' && (
                                        <>
                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Tipo</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.tipo}
                                                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value as EventType })}
                                                    disabled={isActionLoading}
                                                >
                                                    <option value="reuniao">Reunião</option>
                                                    <option value="treinamento">Treinamento</option>
                                                    <option value="feedback">Feedback</option>
                                                    <option value="outro">Outro</option>
                                                </select>
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Data</label>
                                                <input
                                                    type="date"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.data}
                                                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                                                    required
                                                    disabled={isActionLoading}
                                                />
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Início</label>
                                                <input
                                                    type="time"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.horarioInicio}
                                                    onChange={(e) => setFormData({ ...formData, horarioInicio: e.target.value })}
                                                    required
                                                    disabled={isActionLoading}
                                                />
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Fim</label>
                                                <input
                                                    type="time"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.horarioFim}
                                                    onChange={(e) => setFormData({ ...formData, horarioFim: e.target.value })}
                                                    required
                                                    disabled={isActionLoading}
                                                />
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Instrutor (Opc)</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.instrutorId}
                                                    onChange={(e) => setFormData({ ...formData, instrutorId: e.target.value })}
                                                    disabled={isActionLoading}
                                                >
                                                    <option value="">Todos</option>
                                                    {instrutores.map(i => (
                                                        <option key={i.id} value={i.id}>{i.nome}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Sala (Opc)</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    placeholder="S-01"
                                                    value={formData.sala}
                                                    onChange={(e) => setFormData({ ...formData, sala: e.target.value })}
                                                    disabled={isActionLoading}
                                                />
                                            </div>

                                            {editingItem && (
                                                <div className="md:col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Status</label>
                                                    <select
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                        value={formData.status}
                                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as EventStatus })}
                                                        disabled={isActionLoading}
                                                    >
                                                        <option value="agendado">Agendado</option>
                                                        <option value="concluido">Concluído</option>
                                                        <option value="cancelado">Cancelado</option>
                                                    </select>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isActionLoading}
                                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition-colors shadow-sm md:col-span-1 h-[42px] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isActionLoading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                {editingItem ? <Pencil size={20} /> : <Plus size={20} />}
                                                {editingItem ? 'Atualizar' : 'Adicionar'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* List */}
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
                        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
                            <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200 dark:bg-slate-900/50 dark:text-gray-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-6 py-4">Nome</th>

                                    {activeTab === 'instrutores' && (
                                        <>
                                            <th className="px-6 py-4">Email</th>
                                            <th className="px-6 py-4">Telefone</th>
                                        </>
                                    )}

                                    {activeTab === 'cursos' && (
                                        <>
                                            <th className="px-6 py-4">Cód.</th>
                                            <th className="px-6 py-4">Carga Horária</th>
                                            <th className="px-6 py-4">Hora Legal</th>
                                            <th className="px-6 py-4">Cor</th>
                                            <th className="px-6 py-4">Status</th>
                                        </>
                                    )}

                                    {activeTab === 'materias' && (
                                        <>
                                            <th className="px-6 py-4">Curso Vinculado</th>
                                            <th className="px-6 py-4">Carga Horária</th>
                                        </>
                                    )}

                                    {/* Hide Actions Column for Viewers */}
                                    {canManage && <th className="px-6 py-4 text-right">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {activeTab === 'instrutores' && instrutores.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{item.nome}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.email || '-'}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.telefone || '-'}</td>

                                        {canManage && (
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleDelete(item.id, 'instrutor')}
                                                    disabled={isActionLoading}
                                                    className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-30"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {activeTab === 'cursos' && cursos.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{item.nome}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-xs">{item.numeroCurso || '-'}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.cargaHoraria || '-'}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.minutosPorHora || 60} min</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.cor }}></div>
                                                <span className="text-xs uppercase">{item.cor}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.status === 'concluido' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                                    Concluído
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                                    Ativo
                                                </span>
                                            )}
                                        </td>

                                        {canManage && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleEdit(item, 'cursos')}
                                                        disabled={isActionLoading}
                                                        className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors disabled:opacity-30"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id, 'curso')} className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {activeTab === 'materias' && materias.map((item) => {
                                    const curso = cursos.find(c => c.id === item.cursoId);
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{item.nome}</td>
                                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                                {curso ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                                        {curso.numeroCurso ? `${curso.numeroCurso} - ` : ''}{curso.nome}
                                                    </span>
                                                ) : (
                                                    <span className="text-red-400 text-xs">Curso não encontrado</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.cargaHoraria || '-'}</td>

                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => handleDelete(item.id, 'materia')} className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}

                                {activeTab === 'eventos' && eventos.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">
                                            {item.nome}
                                            {item.instrutorId && (
                                                <div className="text-xs text-gray-400 font-normal">
                                                    Instrutor: {instrutores.find(i => i.id === item.instrutorId)?.nome || 'N/A'}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400 capitalize">{item.tipo}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                            {item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                            {item.horarioInicio} - {item.horarioFim}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium border
                                            ${item.status === 'concluido' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    item.status === 'cancelado' ? 'bg-red-100 text-red-700 border-red-200' :
                                                        'bg-blue-50 text-blue-700 border-blue-100'
                                                }`}>
                                                {item.status}
                                            </span>
                                        </td>

                                        {canManage && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleEdit(item, 'eventos')}
                                                        disabled={isActionLoading}
                                                        className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors disabled:opacity-30"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id, 'evento')}
                                                        disabled={isActionLoading}
                                                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-30"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}

                                {((activeTab === 'instrutores' && instrutores.length === 0) ||
                                    (activeTab === 'cursos' && cursos.length === 0) ||
                                    (activeTab === 'materias' && materias.length === 0) ||
                                    (activeTab === 'eventos' && eventos.length === 0)) && (
                                        <tr>
                                            <td colSpan={canManage ? 5 : 4} className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                                    <Plus size={48} className="mb-2 opacity-20" />
                                                    <p className="text-lg font-medium">Nenhum registro encontrado</p>
                                                    <p className="text-sm">Comece adicionando um novo item acima.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    </div>
                </div>
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

            {/* Import Modal */}
            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </>
    );
};