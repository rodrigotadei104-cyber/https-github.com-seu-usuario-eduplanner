import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SalaSelect } from './SalaSelect';
import { useSchedule } from '../context/ScheduleContext';
import { Instrutor, Curso, Materia, Evento, EventType, EventStatus } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { ImportModal } from './ImportModal';
import { CalendarioInstitucionalView } from './CalendarioInstitucionalView';

type Tab = 'instrutores' | 'cursos' | 'materias' | 'eventos' | 'calendario';

type EventoListItem = Evento & {
    ids: string[];
    dataFim?: Date;
    quantidadeDias?: number;
    isPeriodoFerias?: boolean;
};

export const RegistrationView: React.FC = () => {
    const {
        instrutores, addInstrutor, deleteInstrutor,
        cursos, addCurso, updateCurso, deleteCurso,
        materias, addMateria, deleteMateria,
        eventos, addEvento, updateEvento, replaceEventos, deleteEvento, deleteEventos,
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
        dataFim: '',
        horarioInicio: '',
        horarioFim: '',
        instrutorId: '',
        sala: ''
    });

    // Edit State
    const [editingItem, setEditingItem] = useState<{ id: string, type: Tab, ids?: string[] } | null>(null);

    const toDateInputValue = (date: Date | string) => {
        if (typeof date === 'string') return date.substring(0, 10);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const addOneDay = (date: Date) => {
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        return next;
    };

    const isSameLocalDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    // Paginação da lista de eventos (evita lista "infinita" com o passar dos anos).
    const [eventosLimite, setEventosLimite] = useState(30);

    const groupedEventos = useMemo<EventoListItem[]>(() => {
        const regularEvents: EventoListItem[] = [];
        const ferias = eventos
            .filter(e => e.tipo === 'ferias')
            .slice()
            .sort((a, b) => {
                const instructorCompare = (a.instrutorId || '').localeCompare(b.instrutorId || '');
                if (instructorCompare !== 0) return instructorCompare;
                const nameCompare = a.nome.localeCompare(b.nome);
                if (nameCompare !== 0) return nameCompare;
                return new Date(a.data).getTime() - new Date(b.data).getTime();
            });

        eventos
            .filter(e => e.tipo !== 'ferias')
            .forEach(e => regularEvents.push({ ...e, ids: [e.id] }));

        const groups: EventoListItem[] = [];
        for (const event of ferias) {
            const eventDate = event.data instanceof Date ? event.data : new Date(event.data);
            const last = groups[groups.length - 1];
            const canJoin =
                last &&
                last.nome === event.nome &&
                last.instrutorId === event.instrutorId &&
                last.horarioInicio === event.horarioInicio &&
                last.horarioFim === event.horarioFim &&
                last.status === event.status &&
                (last.sala || '') === (event.sala || '') &&
                last.dataFim &&
                isSameLocalDay(eventDate, addOneDay(last.dataFim));

            if (canJoin) {
                last.ids.push(event.id);
                last.dataFim = eventDate;
                last.quantidadeDias = last.ids.length;
            } else {
                groups.push({
                    ...event,
                    ids: [event.id],
                    dataFim: eventDate,
                    quantidadeDias: 1,
                    isPeriodoFerias: true
                });
            }
        }

        // Mais recente primeiro (topo da lista).
        return [...regularEvents, ...groups].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    }, [eventos]);

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
            dataFim: '',
            horarioInicio: '',
            horarioFim: '',
            instrutorId: '',
            sala: ''
        });
    };

    const handleEdit = (item: any, type: Tab) => {
        setEditingItem({ id: item.id, type, ids: item.ids });
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
            data: item.data ? toDateInputValue(item.data) : '',
            dataFim: item.dataFim ? toDateInputValue(item.dataFim) : '',
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
        if (activeTab === 'eventos' && formData.tipo === 'ferias') {
            if (!formData.instrutorId) return;
            if (formData.dataFim && formData.dataFim < formData.data) return;
        }

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
                const eventPayload = {
                    nome: formData.nome,
                    tipo: formData.tipo,
                    data: formData.data,
                    data_fim: formData.tipo === 'ferias' ? (formData.dataFim || formData.data) : undefined,
                    horario_inicio: formData.horarioInicio,
                    horario_fim: formData.horarioFim,
                    instrutor_id: formData.instrutorId || undefined,
                    sala: formData.sala,
                    status: formData.status as EventStatus
                };

                if (formData.tipo === 'ferias') {
                    await replaceEventos(editingItem.ids?.length ? editingItem.ids : [editingItem.id], eventPayload);
                } else {
                    await updateEvento(editingItem.id, eventPayload);
                }
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
                    data_fim: formData.tipo === 'ferias' ? (formData.dataFim || formData.data) : undefined,
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

    const handleDelete = (id: string, type: 'instrutor' | 'curso' | 'materia' | 'evento', ids?: string[]) => {
        const isBulkEvent = type === 'evento' && ids && ids.length > 1;
        setConfirmModal({
            isOpen: true,
            title: isBulkEvent ? 'Excluir período de férias' : 'Excluir registro',
            description: isBulkEvent ? `Tem certeza que deseja excluir este período inteiro? ${ids.length} dias serão removidos.` : 'Tem certeza que deseja excluir este registro? Esta ação é irreversível.',
            action: () => {
                if (type === 'instrutor') deleteInstrutor(id);
                if (type === 'curso') deleteCurso(id);
                if (type === 'materia') deleteMateria(id);
                if (type === 'evento') {
                    if (ids && ids.length > 1) deleteEventos(ids);
                    else deleteEvento(id);
                }
            }
        });
    };

    const tabs = [
        { id: 'instrutores', label: 'Instrutores', color: 'text-blue-700', bg: 'bg-blue-50' },
        { id: 'eventos', label: 'Eventos', color: 'text-emerald-700', bg: 'bg-emerald-50' },
        { id: 'calendario', label: 'Calendário', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    ];

    const formatEventType = (type: EventType) => {
        if (type === 'ferias') return 'Férias';
        if (type === 'reuniao') return 'Reunião';
        return type;
    };

    return (
        <>
            <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Cadastros</h2>
                    {isReadOnly && (
                        <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-amber-200">
                            ! Apenas Leitura
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-8">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id as Tab); resetForm(); }}
                                className={`
                        flex flex-col items-center justify-center min-w-[140px] px-4 py-3 rounded-xl border transition-all duration-200
                        ${isActive
                                        ? `bg-white dark:bg-slate-800 ${tab.bg} border-current shadow-md transform scale-105`
                                        : 'bg-gray-50 border-transparent hover:bg-white text-gray-400 dark:bg-slate-900/50'}
                    `}
                            >
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isActive ? tab.color : 'text-gray-400'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {activeTab === 'calendario' ? (
                    <CalendarioInstitucionalView />
                ) : (
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
                                        Importar Excel / CSV
                                    </button>
                                </div>
                            )}

                            <form onSubmit={handleSave} className={`p-6 rounded-lg border ${editingItem ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20' : 'bg-gray-50 border-gray-100 dark:bg-slate-900/50 dark:border-slate-700'}`}>
                                {editingItem && (
                                    <div className="mb-4 flex justify-between items-center text-blue-700 dark:text-blue-300">
                                        <span className="text-sm font-semibold flex items-center gap-2 uppercase tracking-widest">
                                            MODO EDIÇÃO: {activeTab === 'cursos' ? 'CURSO' : 'REGISTRO'}
                                        </span>
                                        <button type="button" onClick={cancelEdit} className="text-[10px] font-black uppercase hover:underline flex items-center gap-1">
                                            Cancelar
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
                                                    onChange={(e) => {
                                                        const tipo = e.target.value as EventType;
                                                        setFormData({
                                                            ...formData,
                                                            tipo,
                                                            nome: tipo === 'ferias' && !formData.nome ? 'Férias' : formData.nome,
                                                            horarioInicio: tipo === 'ferias' && !formData.horarioInicio ? '00:00' : formData.horarioInicio,
                                                            horarioFim: tipo === 'ferias' && !formData.horarioFim ? '23:59' : formData.horarioFim,
                                                            sala: tipo === 'ferias' ? '' : formData.sala
                                                        });
                                                    }}
                                                    disabled={isActionLoading}
                                                >
                                                    <option value="reuniao">Reunião</option>
                                                    <option value="treinamento">Treinamento</option>
                                                    <option value="feedback">Feedback</option>
                                                    <option value="ferias">Férias</option>
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

                                            {formData.tipo === 'ferias' && (
                                                <div className="md:col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Data Final</label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                        value={formData.dataFim}
                                                        min={formData.data}
                                                        onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                                                        required
                                                        disabled={isActionLoading}
                                                    />
                                                </div>
                                            )}

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
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                                                    Instrutor {formData.tipo === 'ferias' ? '' : '(Opc)'}
                                                </label>
                                                <select
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.instrutorId}
                                                    onChange={(e) => setFormData({ ...formData, instrutorId: e.target.value })}
                                                    required={formData.tipo === 'ferias'}
                                                    disabled={isActionLoading}
                                                >
                                                    <option value="">{formData.tipo === 'ferias' ? 'Selecione...' : 'Todos'}</option>
                                                    {instrutores.map(i => (
                                                        <option key={i.id} value={i.id}>{i.nome}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Sala (Opc)</label>
                                                <SalaSelect
                                                    key={editingItem?.id || 'novo'}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-50"
                                                    value={formData.sala}
                                                    onChange={(v) => setFormData({ ...formData, sala: v })}
                                                    disabled={isActionLoading}
                                                    emptyLabel="— Sem sala (opcional) —"
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
                                                Carregando...
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-black">{editingItem ? 'ATUALIZAR' : 'ADICIONAR NOVO'}</span>
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

                                    {activeTab === 'eventos' && (
                                        <>
                                            <th className="px-6 py-4">Tipo</th>
                                            <th className="px-6 py-4">Data</th>
                                            <th className="px-6 py-4">HorÃ¡rio</th>
                                            <th className="px-6 py-4">Status</th>
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
                                                        className="text-red-600 hover:text-red-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-30"
                                                    >
                                                        Excluir
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
                                                        className="text-blue-600 hover:text-blue-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-30"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(item.id, 'curso')}
                                                        className="text-red-600 hover:text-red-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                                    >
                                                        Excluir
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
                                                    <button 
                                                        onClick={() => handleDelete(item.id, 'materia')}
                                                        className="text-red-600 hover:text-red-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                                    >
                                                        Excluir
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}

                                {activeTab === 'eventos' && groupedEventos.slice(0, eventosLimite).map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">
                                            {item.nome}
                                            {item.instrutorId && (
                                                <div className="text-xs text-gray-400 font-normal">
                                                    Instrutor: {instrutores.find(i => i.id === item.instrutorId)?.nome || 'N/A'}
                                                </div>
                                            )}
                                            {item.isPeriodoFerias && item.quantidadeDias && item.quantidadeDias > 1 && (
                                                <div className="text-xs text-rose-500 font-semibold">
                                                    Período com {item.quantidadeDias} dias
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400 capitalize">{formatEventType(item.tipo)}</td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                            {item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-'}
                                            {item.dataFim && !isSameLocalDay(new Date(item.data), item.dataFim) ? ` até ${item.dataFim.toLocaleDateString('pt-BR')}` : ''}
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
                                                        className="text-blue-600 hover:text-blue-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-30"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id, 'evento', item.ids)}
                                                        disabled={isActionLoading}
                                                        className="text-red-600 hover:text-red-800 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-30"
                                                    >
                                                        Excluir
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}

                                {activeTab === 'eventos' && groupedEventos.length > eventosLimite && (
                                    <tr>
                                        <td colSpan={canManage ? 6 : 5} className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => setEventosLimite(l => l + 30)}
                                                className="text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 px-4 py-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                            >
                                                Mostrar mais ({groupedEventos.length - eventosLimite} restantes)
                                            </button>
                                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-2">
                                                Mostrando {eventosLimite} de {groupedEventos.length}
                                            </p>
                                        </td>
                                    </tr>
                                )}

                                {((activeTab === 'instrutores' && instrutores.length === 0) ||
                                    (activeTab === 'cursos' && cursos.length === 0) ||
                                    (activeTab === 'materias' && materias.length === 0) ||
                                    (activeTab === 'eventos' && groupedEventos.length === 0)) && (
                                        <tr>
                                            <td colSpan={canManage ? 5 : 4} className="px-6 py-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                                    <span className="text-4xl font-black opacity-10 mb-4 tracking-tighter uppercase">Vazio</span>
                                                    <p className="text-lg font-bold uppercase tracking-widest">Nenhum registro encontrado</p>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mt-2">{canManage ? 'ADICIONE UM NOVO ITEM NO FORMULÁRIO ACIMA' : 'SEM PERMISSÃO PARA CRIAR REGISTROS'}</p>
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

            {/* Import Modal */}
            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </>
    );
};
