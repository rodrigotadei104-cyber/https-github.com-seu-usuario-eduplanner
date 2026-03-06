import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Sparkles, CheckCircle, Trash2, Loader2, AlertTriangle, ArrowLeft, Database, Search, ChevronDown } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services/aula.service';
import { catalogoService } from '../services/catalogo.service';
import { calendarioService } from '../services/calendario.service';
import { CatalogoCurso, DisciplinaCurso, Aula, HorarioSlot } from '../types';
import { generateSchedule, ScheduleEngineInput } from '../lib/scheduleEngine';
import { format, parseISO, addMinutes } from 'date-fns';

interface AberturaTurmaWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AberturaTurmaWizard: React.FC<AberturaTurmaWizardProps> = ({ isOpen, onClose }) => {
    const { refreshData, instrutores } = useSchedule();
    const tenantId = 'rodrigotadei104-cyber'; // Default provisório até injetarmos Auth session

    // Reference Data States
    const [cursosBase, setCursosBase] = useState<CatalogoCurso[]>([]);
    const [disciplinasSelecionadas, setDisciplinasSelecionadas] = useState<DisciplinaCurso[]>([]);
    const [feriadosSet, setFeriadosSet] = useState<Set<string>>(new Set());

    // UI States
    const [step, setStep] = useState<'config' | 'generating' | 'preview'>('config');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form States
    const [selectedCursoId, setSelectedCursoId] = useState('');
    const [cursoSearchText, setCursoSearchText] = useState('');
    const [isCursoDropdownOpen, setIsCursoDropdownOpen] = useState(false);
    const cursoDropdownRef = useRef<HTMLDivElement>(null);
    const [nomeTurma, setNomeTurma] = useState('');
    const [selectedInstructorId, setSelectedInstructorId] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

    // Shift Logic
    const [shift1Start, setShift1Start] = useState('08:00');
    const [shift1End, setShift1End] = useState('12:00');
    const [shift2Start, setShift2Start] = useState('');
    const [shift2End, setShift2End] = useState('');

    // Output State (From Engine, mapped as Omit<Aula, 'id'>)
    const [generatedSchedule, setGeneratedSchedule] = useState<Omit<Aula, 'id'>[]>([]);
    const [diasPuladosFeriado, setDiasPuladosFeriado] = useState<Array<{ data: string; motivo: string }>>([]);

    useEffect(() => {
        if (isOpen) {
            carregarDadosBase();
        }
    }, [isOpen]);

    const carregarDadosBase = async () => {
        try {
            const [cursosDb, blockedSet] = await Promise.all([
                catalogoService.getCursos(),
                calendarioService.getDiasBloqueadosSet()
            ]);
            setCursosBase(cursosDb.filter(c => c.ativo));
            setFeriadosSet(blockedSet);
        } catch (err) {
            console.error("Erro ao carregar dados base", err);
        }
    };

    const handleCourseChange = async (cursoId: string) => {
        setSelectedCursoId(cursoId);
        setIsCursoDropdownOpen(false);
        if (!cursoId) {
            setDisciplinasSelecionadas([]);
            return;
        }
        try {
            const disciplinas = await catalogoService.getDisciplinasPorCurso(cursoId);
            setDisciplinasSelecionadas(disciplinas);
        } catch (err) {
            console.error("Erro ao carregar disciplinas do curso", err);
        }
    };

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (cursoDropdownRef.current && !cursoDropdownRef.current.contains(e.target as Node)) {
                setIsCursoDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDayToggle = (day: number) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
    };

    const handleGenerateEngine = async () => {
        if (!selectedCursoId) return setError('Selecione um curso base do catálogo.');
        if (!nomeTurma.trim()) return setError('Indique o Nome/Código da nova Turma.');
        if (selectedDays.length === 0) return setError('Selecione pelo menos um dia da semana.');
        if (disciplinasSelecionadas.length === 0) return setError('Este curso base não possui disciplinas pedagógicas a serem lecionadas.');

        setError(null);
        setStep('generating');

        try {
            // Buscar feriados frescos do banco no momento de gerar (não depender do state)
            let diasBloqueados: Set<string>;
            try {
                diasBloqueados = await calendarioService.getDiasBloqueadosSet();
                console.log('[Engine] Dias bloqueados carregados:', diasBloqueados.size, Array.from(diasBloqueados).slice(0, 5));
            } catch {
                diasBloqueados = new Set(); // falha silenciosa — não impede geração
            }

            const timeSlots: HorarioSlot[] = [];
            if (shift1Start && shift1End) timeSlots.push({ inicio: shift1Start, fim: shift1End });
            if (shift2Start && shift2End) timeSlots.push({ inicio: shift2Start, fim: shift2End });

            if (timeSlots.length === 0) {
                throw new Error("Defina pelo menos 1 turno válido de horários.");
            }

            const cursoObj = cursosBase.find(c => c.id === selectedCursoId);
            const instrutorObj = instrutores.find(i => i.id === selectedInstructorId);

            const engineInput: ScheduleEngineInput = {
                tenantId,
                numeroTurma: nomeTurma,
                cursoId: selectedCursoId,
                cursoNome: cursoObj?.nomeCurso || 'Curso Desconhecido',
                instrutorId: selectedInstructorId,
                instrutorNome: instrutorObj?.nome || '',
                salaPadrao: selectedRoom,
                dataInicio: startDate,
                diasSemanaSelecionados: selectedDays,
                horariosDoDia: timeSlots,
                disciplinas: disciplinasSelecionadas,
                diasBloqueados,
            };

            const engineOutput = generateSchedule(engineInput);
            setGeneratedSchedule(engineOutput.aulas);
            setDiasPuladosFeriado(engineOutput.diasPuladosFeriado);
            console.log('[Engine] Dias pulados por feriado:', engineOutput.diasPuladosFeriado);
            setStep('preview');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro fatal na engine de horários.');
            setStep('config');
        }
    };


    const removeClass = (index: number) => {
        setGeneratedSchedule(prev => prev.filter((_, i) => i !== index));
    };

    const handleConfirmAndSave = async () => {
        if (generatedSchedule.length === 0) return;

        setIsSaving(true);
        try {
            // O serviço salvarGradeAutomatica já espera o formato camelCase vindo da Engine
            // e faz a conversão para snake_case internamente.
            const response = await aulaService.salvarGradeAutomatica(generatedSchedule);

            if (response.success) {
                const totalCreated = (response.data as any[])?.length || generatedSchedule.length;
                alert(`Sucesso Supremo!\n\n${totalCreated} aulas foram cravadas no Banco de Dados em apenas 1 clique.`);
                await refreshData();
                onClose();
            } else {
                alert("Falha no Banco: " + response.error);
            }
        } catch (error) {
            console.error(error);
            alert("Erro catastrófico ao despachar grade para a API.");
        } finally {
            setIsSaving(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] dark:bg-slate-900 border border-slate-700">
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center bg-indigo-600 dark:bg-indigo-900 border-indigo-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 text-white rounded-lg backdrop-blur shadow-sm">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Motor de Abertura de Turma</h2>
                            <p className="text-sm font-medium text-indigo-100 opacity-90">Algoritmo Institucional Rápido (Local Engine)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors bg-black/10 hover:bg-black/20 p-2 rounded-full"><X size={20} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    {step === 'config' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 dark:text-slate-500 border-b pb-2 dark:border-slate-800">1. Identificação</h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Curso Base (Matriz Curricular)</label>

                                            {/* Combobox Searchable */}
                                            <div className="relative" ref={cursoDropdownRef}>
                                                <div
                                                    className="w-full flex items-center gap-2 p-2.5 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700 cursor-pointer focus-within:ring-2 focus-within:ring-indigo-500"
                                                    onClick={() => setIsCursoDropdownOpen(true)}
                                                >
                                                    <Search size={14} className="text-slate-400 shrink-0" />
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar curso pelo nome..."
                                                        value={cursoSearchText}
                                                        onChange={e => {
                                                            setCursoSearchText(e.target.value);
                                                            setIsCursoDropdownOpen(true);
                                                            if (!e.target.value) handleCourseChange('');
                                                        }}
                                                        onFocus={() => setIsCursoDropdownOpen(true)}
                                                        className="flex-1 outline-none bg-transparent text-sm dark:text-white placeholder-slate-400"
                                                    />
                                                    {selectedCursoId && (
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); handleCourseChange(''); setCursoSearchText(''); }}
                                                            className="text-slate-400 hover:text-red-500 transition-colors text-xs px-1"
                                                        >✕</button>
                                                    )}
                                                    <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${isCursoDropdownOpen ? 'rotate-180' : ''}`} />
                                                </div>

                                                {/* Dropdown list */}
                                                {isCursoDropdownOpen && (
                                                    <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                                                        {cursosBase
                                                            .filter(c => c.nomeCurso.toLowerCase().includes(cursoSearchText.toLowerCase()))
                                                            .length === 0 ? (
                                                            <div className="p-3 text-sm text-slate-400 text-center">
                                                                Nenhum curso encontrado para "{cursoSearchText}"
                                                            </div>
                                                        ) : (
                                                            cursosBase
                                                                .filter(c => c.nomeCurso.toLowerCase().includes(cursoSearchText.toLowerCase()))
                                                                .map(c => (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onClick={() => { handleCourseChange(c.id); setCursoSearchText(c.nomeCurso); }}
                                                                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-2 ${selectedCursoId === c.id ? 'bg-indigo-50 dark:bg-slate-700 font-semibold text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'
                                                                            }`}
                                                                    >
                                                                        <span className="truncate">{c.nomeCurso}</span>
                                                                        <span className="text-xs text-slate-400 shrink-0">{c.cargaTotalHoras}h</span>
                                                                    </button>
                                                                ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {selectedCursoId && disciplinasSelecionadas.length > 0 && (
                                                <p className="text-xs text-emerald-600 mt-1.5 dark:text-emerald-400 font-medium">✓ Acoplado {disciplinasSelecionadas.length} disciplinas da grade na fila do motor.</p>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">
                                                Nome ou Código da Nova Turma <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={nomeTurma}
                                                onChange={e => setNomeTurma(e.target.value)}
                                                placeholder="Ex: T01-2027-Matutino"
                                                className={`w-full p-2.5 border rounded-lg text-sm font-mono bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 ${!nomeTurma.trim() && error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Data de Início das Aulas</label>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={e => setStartDate(e.target.value)}
                                                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Dias da Semana Ativos</label>
                                                <div className="flex gap-1 justify-between mt-1">
                                                    {[1, 2, 3, 4, 5, 6, 0].map(day => {
                                                        const displayLabels: Record<number, string> = { 1: 'S', 2: 'T', 3: 'Q', 4: 'Q', 5: 'S', 6: 'S', 0: 'D' };
                                                        const isSelected = selectedDays.includes(day);
                                                        return (
                                                            <button
                                                                key={day}
                                                                onClick={() => handleDayToggle(day)}
                                                                className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${isSelected
                                                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-200 dark:ring-indigo-900 border border-transparent'
                                                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border dark:border-slate-700'}`}
                                                            >
                                                                {displayLabels[day]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 dark:text-slate-500 border-b pb-2 dark:border-slate-800">2. Parâmetros Operacionais</h3>

                                    <div className="space-y-5">
                                        <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl dark:bg-slate-800/50 dark:border-slate-700">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Horários Diários da Turma</h4>
                                            <div className="grid gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium w-16 text-right">Turno 1:</span>
                                                    <input type="time" value={shift1Start} onChange={e => setShift1Start(e.target.value)} className="w-full max-w-[120px] p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-600" />
                                                    <span className="text-slate-400">-</span>
                                                    <input type="time" value={shift1End} onChange={e => setShift1End(e.target.value)} className="w-full max-w-[120px] p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-600" />
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium w-16 text-right opacity-70">Turno 2<br /><span className="text-[9px]">(Opcional)</span>:</span>
                                                    <input type="time" value={shift2Start} onChange={e => setShift2Start(e.target.value)} className="w-full max-w-[120px] p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-600" />
                                                    <span className="text-slate-400">-</span>
                                                    <input type="time" value={shift2End} onChange={e => setShift2End(e.target.value)} className="w-full max-w-[120px] p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-600" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1 opacity-80">Alocação Padrão (Professor)</label>
                                                <select
                                                    value={selectedInstructorId}
                                                    onChange={e => setSelectedInstructorId(e.target.value)}
                                                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
                                                >
                                                    <option value="">(Definir depois)</option>
                                                    {instrutores.map(i => (
                                                        <option key={i.id} value={i.id}>{i.nome}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1 opacity-80">Sala Titular da Turma</label>
                                                <input
                                                    type="text"
                                                    value={selectedRoom}
                                                    onChange={e => setSelectedRoom(e.target.value)}
                                                    placeholder="Ex: Laboratório X"
                                                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'generating' && (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin dark:border-indigo-900/40 dark:border-t-indigo-500"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Clock size={24} className="text-indigo-600 dark:text-indigo-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold mt-8 dark:text-white">Cálculo Determinístico de Matriz...</h3>
                            <p className="text-slate-500 mt-3 max-w-sm mx-auto">
                                Evitando feriados corporativos, preenchendo horários vagos e fatiando restos matemáticos.
                            </p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100 shrink-0 dark:bg-indigo-900/20 dark:border-indigo-800/50">
                                <div>
                                    <h3 className="font-bold text-indigo-900 text-lg flex items-center gap-2 dark:text-indigo-200">
                                        <CheckCircle className="text-emerald-500" /> Previsão Matemática (Sucesso)
                                    </h3>
                                    <p className="text-sm text-indigo-700 dark:text-indigo-300">Revise a Grade Gerada Perfeitamente</p>
                                    {diasPuladosFeriado.length > 0 && (
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                                            🚫 {diasPuladosFeriado.length} dia{diasPuladosFeriado.length !== 1 ? 's' : ''} pulado{diasPuladosFeriado.length !== 1 ? 's' : ''} por feriado/bloqueio — exibidos em vermelho na grade
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="block text-3xl font-black text-indigo-900 dark:text-indigo-200">{generatedSchedule.length}</span>
                                    <span className="text-xs text-indigo-600 uppercase font-bold tracking-widest dark:text-indigo-400">Aulas Projetadas</span>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 overflow-y-auto bg-white custom-scrollbar dark:bg-slate-800 dark:border-slate-700 shadow-inner">
                                <table className="w-full text-left text-sm relative">
                                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/90 dark:text-slate-400">
                                        <tr>
                                            <th className="p-3 w-32 border-b dark:border-slate-700">Data</th>
                                            <th className="p-3 w-40 border-b dark:border-slate-700">Horário Previsto</th>
                                            <th className="p-3 border-b dark:border-slate-700">Disciplina Associada</th>
                                            <th className="p-3 w-40 border-b dark:border-slate-700 text-center">Acionamento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {(() => {
                                            // Montar lista intercalada: aulas + feriados pulados
                                            type Row =
                                                | { kind: 'aula'; idx: number; cls: Omit<Aula, 'id'> }
                                                | { kind: 'feriado'; data: string; motivo: string };

                                            const feriadoSet = new Map(
                                                diasPuladosFeriado.map(f => [f.data, f.motivo])
                                            );

                                            // Gerar datas de feriados que ficam entre aulas (para intercalar)
                                            const rows: Row[] = [];
                                            let feriadosJaExibidos = new Set<string>();

                                            generatedSchedule.forEach((cls, idx) => {
                                                const dataAula = format(new Date(cls.data), 'yyyy-MM-dd');
                                                // Exibir feriados que ocorreram antes desta aula (e ainda não exibidos)
                                                diasPuladosFeriado.forEach(f => {
                                                    if (!feriadosJaExibidos.has(f.data) && f.data < dataAula) {
                                                        rows.push({ kind: 'feriado', data: f.data, motivo: f.motivo });
                                                        feriadosJaExibidos.add(f.data);
                                                    }
                                                });
                                                rows.push({ kind: 'aula', idx, cls });
                                            });

                                            return rows.map((row, i) => {
                                                if (row.kind === 'feriado') {
                                                    return (
                                                        <tr key={`feriado-${row.data}`} className="bg-red-50 dark:bg-red-900/10">
                                                            <td className="p-2 font-mono text-xs font-bold text-red-700 dark:text-red-400">
                                                                {format(new Date(row.data + 'T12:00:00'), 'dd/MM/yyyy')}
                                                            </td>
                                                            <td colSpan={3} className="p-2">
                                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full">
                                                                    🚫 {row.motivo} — Aula não realizada neste dia
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                return (
                                                    <tr key={row.idx} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-750">
                                                        <td className="p-2 font-mono text-xs dark:text-slate-300">
                                                            {format(new Date(row.cls.data), 'dd/MM/yyyy')}
                                                        </td>
                                                        <td className="p-2">
                                                            <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded dark:bg-slate-700/50">{row.cls.horarioInicio}</span>
                                                                <span className="opacity-50">ate</span>
                                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded dark:bg-slate-700/50">{row.cls.horarioFim}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-2">
                                                            <div className="font-medium text-slate-800 text-sm dark:text-slate-200 truncate pr-4">
                                                                {row.cls.materia}
                                                            </div>
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => removeClass(row.idx)}
                                                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {error && step === 'config' && (
                        <div className="mt-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-center gap-3 font-medium dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                            <AlertTriangle size={20} className="shrink-0" /> {error}
                        </div>
                    )}
                </div>

                {/* Footer fixed */}
                <div className="p-5 border-t border-slate-200 flex justify-between bg-slate-50 shrink-0 dark:bg-slate-800 dark:border-slate-700">
                    {step === 'config' ? (
                        <div className="ml-auto w-full md:w-auto">
                            <button
                                onClick={handleGenerateEngine}
                                className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 text-sm uppercase tracking-wider"
                            >
                                <Sparkles size={18} /> Projetar Automático
                            </button>
                        </div>
                    ) : step === 'preview' ? (
                        <>
                            <button
                                onClick={() => setStep('config')}
                                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl flex items-center gap-2 transition dark:text-slate-300 dark:hover:bg-slate-700 uppercase tracking-wider text-xs"
                            >
                                <ArrowLeft size={16} /> Refazer Contas
                            </button>
                            <button
                                onClick={handleConfirmAndSave}
                                disabled={isSaving}
                                className="px-8 py-3 text-sm font-bold uppercase tracking-wider text-white bg-emerald-600 border border-emerald-500 rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-500/30 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                                {isSaving ? 'Salvando Multidão de Aulas...' : 'Realizar Abertura de Turma (Gravar)'}
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
