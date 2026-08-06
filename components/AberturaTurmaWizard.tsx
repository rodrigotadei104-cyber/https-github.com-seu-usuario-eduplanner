import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SalaSelect } from './SalaSelect';
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services/aula.service';
import { catalogoService } from '../services/catalogo.service';
import { calendarioService } from '../services/calendario.service';
import { turmaService } from '../services/turma.service';
import { CatalogoCurso, DisciplinaCurso, Aula, HorarioSlot } from '../types';
import { generateSchedule, ScheduleEngineInput } from '../lib/scheduleEngine';
import { format, parseISO, addMinutes } from 'date-fns';

interface AberturaTurmaWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

const toMin = (t: string): number => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dataStr = (d: any): string => { const dt = d instanceof Date ? d : new Date(d); return format(dt, 'yyyy-MM-dd'); };

export const AberturaTurmaWizard: React.FC<AberturaTurmaWizardProps> = ({ isOpen, onClose }) => {
    const { refreshData, instrutores, userProfile, aulas } = useSchedule();
    const tenantId = userProfile.tenantId; // Tenant real do usuário autenticado via ScheduleContext

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
    // Instrutor por disciplina (disciplinaId -> instructorId). Vazio/ausente = usa o padrão acima.
    const [instrutoresPorDisciplina, setInstrutoresPorDisciplina] = useState<Record<string, string>>({});
    const [selectedRoom, setSelectedRoom] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

    // Shift Logic
    const [shift1Start, setShift1Start] = useState('08:00');
    const [shift1End, setShift1End] = useState('12:00');
    const [shift2Start, setShift2Start] = useState('');
    const [shift2End, setShift2End] = useState('');

    // Blocked Dates for this specific cohort
    const [datasBloqueadasTurma, setDatasBloqueadasTurma] = useState<string[]>([]);
    const [newDataBloqueada, setNewDataBloqueada] = useState('');

    // Output State (From Engine, mapped as Omit<Aula, 'id'>)
    const [generatedSchedule, setGeneratedSchedule] = useState<Omit<Aula, 'id'>[]>([]);
    const [diasPuladosFeriado, setDiasPuladosFeriado] = useState<Array<{ data: string; motivo: string }>>([]);

    // Conflito de instrutor: aula gerada cujo professor já tem outra aula (existente no banco)
    // na mesma data com sobreposição de horário. Checa em memória contra o contexto (todas as aulas).
    const conflitosInstrutor = useMemo(() => {
        const map: Record<number, { instrutorNome: string; existente: string }> = {};
        if (generatedSchedule.length === 0) return map;
        const existentes = (aulas as any[]).filter(e => e.status !== 'cancelada');
        generatedSchedule.forEach((g: any, idx) => {
            const gInstrId = g.instrutor; // a engine grava o ID do instrutor neste campo
            if (!gInstrId) return;
            const gDate = dataStr(g.data);
            const gIni = toMin(g.horarioInicio), gFim = toMin(g.horarioFim);
            for (const e of existentes) {
                const mesmoInstrutor = (e.instrutorId && e.instrutorId === gInstrId) || (e.instrutor && g.instrutorNome && e.instrutor === g.instrutorNome);
                if (!mesmoInstrutor) continue;
                if (dataStr(e.data) !== gDate) continue;
                if (gIni < toMin(e.horarioFim) && gFim > toMin(e.horarioInicio)) {
                    map[idx] = {
                        instrutorNome: g.instrutorNome || '',
                        existente: `${e.curso || e.materia || 'Aula'} ${e.horarioInicio}-${e.horarioFim}${e.numeroTurma ? ' • Turma ' + e.numeroTurma : ''}`
                    };
                    break;
                }
            }
        });
        return map;
    }, [generatedSchedule, aulas]);

    const totalConflitos = Object.keys(conflitosInstrutor).length;

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
        setInstrutoresPorDisciplina({}); // disciplinas mudam ao trocar de curso
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

    const addDataBloqueada = () => {
        if (!newDataBloqueada) return;
        if (datasBloqueadasTurma.includes(newDataBloqueada)) return;
        setDatasBloqueadasTurma(prev => [...prev, newDataBloqueada].sort());
        setNewDataBloqueada('');
    };

    const removeDataBloqueada = (date: string) => {
        setDatasBloqueadasTurma(prev => prev.filter(d => d !== date));
    };

    const resetForm = () => {
        setStep('config');
        setSelectedCursoId('');
        setCursoSearchText('');
        setNomeTurma('');
        setSelectedInstructorId('');
        setInstrutoresPorDisciplina({});
        setSelectedRoom('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setSelectedDays([1, 2, 3, 4, 5]);
        setShift1Start('08:00');
        setShift1End('12:00');
        setShift2Start('');
        setShift2End('');
        setDatasBloqueadasTurma([]);
        setNewDataBloqueada('');
        setGeneratedSchedule([]);
        setDiasPuladosFeriado([]);
        setError(null);
        setDisciplinasSelecionadas([]);
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

            // Resolve o instrutor por disciplina (só as que têm override) para {id, nome}.
            const instrutoresPorDisciplinaResolvido: Record<string, { id: string; nome: string }> = {};
            for (const [discId, instrId] of Object.entries(instrutoresPorDisciplina)) {
                if (!instrId) continue;
                const obj = instrutores.find(i => i.id === instrId);
                instrutoresPorDisciplinaResolvido[discId] = { id: instrId, nome: obj?.nome || '' };
            }

            const engineInput: ScheduleEngineInput = {
                tenantId,
                numeroTurma: nomeTurma,
                cursoId: selectedCursoId,
                cursoNome: cursoObj?.nomeCurso || 'Curso Desconhecido',
                instrutorId: selectedInstructorId,
                instrutorNome: instrutorObj?.nome || '',
                instrutoresPorDisciplina: instrutoresPorDisciplinaResolvido,
                salaPadrao: selectedRoom,
                dataInicio: startDate,
                diasSemanaSelecionados: selectedDays,
                horariosDoDia: timeSlots,
                disciplinas: disciplinasSelecionadas,
                diasBloqueados,
                datasBloqueadasTurma: new Set(datasBloqueadasTurma),
                minutosPorHora: Number(cursoObj?.tipoHoraMin) || 60
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

        if (totalConflitos > 0) {
            const ok = window.confirm(
                `Atenção: ${totalConflitos} aula(s) têm o instrutor já ocupado em outro horário (marcadas em vermelho no preview).\n\nDeseja salvar mesmo assim?`
            );
            if (!ok) return;
        }

        setIsSaving(true);
        try {
            // 1. Criar o registro na tabela 'turmas' primeiro
            const timeSlots: HorarioSlot[] = [];
            if (shift1Start && shift1End) timeSlots.push({ inicio: shift1Start, fim: shift1End });
            if (shift2Start && shift2End) timeSlots.push({ inicio: shift2Start, fim: shift2End });

            console.log('[Wizard] Criando registro da Turma...', nomeTurma);
            const novaTurma = await turmaService.create({
                tenantId,
                numeroTurma: nomeTurma,
                cursoId: selectedCursoId,
                instrutorId: selectedInstructorId || undefined,
                salaPadrao: selectedRoom || undefined,
                dataInicio: startDate,
                diasSemanaSelecionados: selectedDays,
                horariosDoDia: timeSlots,
                datasBloqueadas: datasBloqueadasTurma,
                status: 'planejada'
            });

            console.log('[Wizard] Turma criada com ID:', novaTurma.id);

            // 2. Salvar as aulas vinculando-as ao ID da turma recém criada
            const aulasComTurmaId = generatedSchedule.map(aula => ({
                ...aula,
                turmaId: novaTurma.id,
                numeroTurma: nomeTurma // Mantendo redundância útil
            }));

            console.log('[Wizard] Salvando grade de aulas...', aulasComTurmaId.length);
            const response = await aulaService.salvarGradeAutomatica(aulasComTurmaId);

            if (response.success) {
                const totalCreated = (response.data as any[])?.length || generatedSchedule.length;
                alert(`Sucesso Supremo!\n\nTurma "${nomeTurma}" aberta e ${totalCreated} aulas foram cravadas no Banco de Dados.`);
                await refreshData();
                resetForm();
                onClose();
            } else {
                alert("Falha no Banco: " + response.error);
            }
        } catch (error: any) {
            console.error('[Wizard] Erro ao salvar turma/aulas:', error);
            const detalhe = error?.message || error?.details || String(error);
            alert(`Erro ao salvar a turma no banco de dados.\n\nDetalhe técnico: ${detalhe}`);
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
                        <div className="px-3 py-1 bg-white/20 text-white rounded text-[10px] font-black uppercase tracking-widest backdrop-blur shadow-sm">
                            Motor
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Abertura de Turma</h2>
                            <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest opacity-90">Algoritmo Institucional Rápido (Local Engine)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white font-black hover:text-black transition-colors uppercase tracking-widest text-[10px]">Fechar [X]</button>
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
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">BUSCA</div>
                                                    <input
                                                        type="text"
                                                        placeholder="NOME DO CURSO..."
                                                        value={cursoSearchText}
                                                        onChange={e => {
                                                            setCursoSearchText(e.target.value);
                                                            setIsCursoDropdownOpen(true);
                                                            if (!e.target.value) handleCourseChange('');
                                                        }}
                                                        onFocus={() => setIsCursoDropdownOpen(true)}
                                                        className="flex-1 outline-none bg-transparent text-sm font-bold dark:text-white placeholder-slate-300 uppercase"
                                                    />
                                                    {selectedCursoId && (
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); handleCourseChange(''); setCursoSearchText(''); }}
                                                            className="text-red-500 font-black text-xs px-1"
                                                        >[X]</button>
                                                    )}
                                                    <div className={`text-[10px] font-black text-slate-400 transition-transform ${isCursoDropdownOpen ? 'rotate-180' : ''}`}>MENU</div>
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
                                                <SalaSelect
                                                    value={selectedRoom}
                                                    onChange={setSelectedRoom}
                                                    emptyLabel="— Selecione a sala —"
                                                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
                                                />
                                            </div>
                                        </div>

                                        {disciplinasSelecionadas.length > 0 && (
                                            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl dark:bg-slate-800/50 dark:border-slate-700">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                    Instrutor por disciplina <span className="text-slate-400 normal-case font-normal">(opcional)</span>
                                                </h4>
                                                <p className="text-[11px] text-slate-400 mb-3">Deixe em "(usar padrão)" para herdar o professor padrão. Defina aqui só as disciplinas com professor diferente.</p>
                                                <div className="space-y-2 max-h-56 overflow-auto pr-1 custom-scrollbar">
                                                    {disciplinasSelecionadas.map(d => (
                                                        <div key={d.id} className="flex items-center gap-2">
                                                            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate" title={d.nomeDisciplina}>
                                                                {d.nomeDisciplina}
                                                                <span className="text-[10px] text-slate-400 ml-1">{d.cargaHoras}h</span>
                                                            </span>
                                                            <select
                                                                value={instrutoresPorDisciplina[d.id] || ''}
                                                                onChange={e => setInstrutoresPorDisciplina(prev => ({ ...prev, [d.id]: e.target.value }))}
                                                                className="w-44 shrink-0 p-1.5 border rounded-lg text-xs bg-white dark:bg-slate-800 dark:border-slate-700"
                                                            >
                                                                <option value="">(usar padrão)</option>
                                                                {instrutores.map(i => (
                                                                    <option key={i.id} value={i.id}>{i.nome}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-amber-50 p-4 border border-amber-200 rounded-xl dark:bg-amber-900/10 dark:border-amber-900/30">
                                            <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-2 dark:text-amber-400">
                                                [ ATENÇÃO ] Datas Bloqueadas desta Turma
                                            </h4>
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="date"
                                                    value={newDataBloqueada}
                                                    onChange={e => setNewDataBloqueada(e.target.value)}
                                                    className="flex-1 p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700"
                                                />
                                                <button
                                                    onClick={addDataBloqueada}
                                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition"
                                                >
                                                    Pular Data
                                                </button>
                                            </div>
                                            {datasBloqueadasTurma.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {datasBloqueadasTurma.map(date => (
                                                        <span key={date} className="inline-flex items-center gap-1.5 bg-white border border-amber-200 px-2 py-1 rounded-md text-xs font-mono font-bold text-amber-800 dark:bg-slate-800 dark:border-amber-900/50 dark:text-amber-400 shadow-sm">
                                                            {format(parseISO(date), 'dd/MM/yy')}
                                                            <button onClick={() => removeDataBloqueada(date)} className="text-amber-400 hover:text-red-500 transition-colors font-bold">[X]</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {datasBloqueadasTurma.length === 0 && (
                                                <p className="text-[10px] text-amber-600/70 italic dark:text-amber-500/50">Nenhuma data extra bloqueada para esta turma.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'generating' && (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="relative">
                                <div className="w-16 h-16 border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin dark:border-indigo-900/40 dark:border-t-indigo-500"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-indigo-600 uppercase">
                                    CPU
                                </div>
                            </div>
                            <h3 className="text-xl font-black mt-8 uppercase tracking-tighter dark:text-white">Cálculo de Matriz...</h3>
                            <p className="text-slate-500 mt-3 max-w-sm mx-auto">
                                Evitando feriados corporativos, preenchendo horários vagos e fatiando restos matemáticos.
                            </p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100 shrink-0 dark:bg-indigo-900/20 dark:border-indigo-800/50">
                                <div>
                                    <h3 className="font-black text-indigo-900 text-lg flex items-center gap-2 dark:text-indigo-200 uppercase tracking-tighter">
                                        [ OK ] Previsão Matemática do Motor
                                    </h3>
                                    <p className="text-sm text-indigo-700 dark:text-indigo-300">Revise a Grade Gerada Perfeitamente</p>
                                    {diasPuladosFeriado.length > 0 && (
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                                            [ BLOQUEADO ] {diasPuladosFeriado.length} dia{diasPuladosFeriado.length !== 1 ? 's' : ''} pulado{diasPuladosFeriado.length !== 1 ? 's' : ''} por feriado/bloqueio — exibidos em vermelho na grade
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="block text-3xl font-black text-indigo-900 dark:text-indigo-200">{generatedSchedule.length}</span>
                                    <span className="text-xs text-indigo-600 uppercase font-bold tracking-widest dark:text-indigo-400">Aulas Projetadas</span>
                                </div>
                            </div>

                            {totalConflitos > 0 && (
                                <div className="shrink-0 bg-red-50 border border-red-200 rounded-xl p-3 dark:bg-red-900/15 dark:border-red-900/40">
                                    <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                                        ⚠ {totalConflitos} aula(s) com instrutor já ocupado nesse horário
                                    </p>
                                    <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                                        Marcadas em vermelho abaixo. Volte para trocar o instrutor da disciplina, ou salve mesmo assim (será pedida confirmação).
                                    </p>
                                </div>
                            )}

                            <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 overflow-y-auto bg-white custom-scrollbar dark:bg-slate-800 dark:border-slate-700 shadow-inner">
                                <table className="w-full text-left text-sm relative">
                                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/90 dark:text-slate-400">
                                        <tr>
                                            <th className="p-3 w-32 border-b dark:border-slate-700">Data</th>
                                            <th className="p-3 w-40 border-b dark:border-slate-700">Horário Previsto</th>
                                            <th className="p-3 border-b dark:border-slate-700">Disciplina Associada</th>
                                            <th className="p-3 w-44 border-b dark:border-slate-700">Instrutor</th>
                                            <th className="p-3 w-40 border-b dark:border-slate-700 text-center">Acionamento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {(() => {
                                            type Row =
                                                | { kind: 'aula'; idx: number; cls: Omit<Aula, 'id'> }
                                                | { kind: 'feriado'; data: string; motivo: string };

                                            const rows: Row[] = [];
                                            let feriadosJaExibidos = new Set<string>();

                                            generatedSchedule.forEach((cls, idx) => {
                                                const dataAula = format(new Date(cls.data), 'yyyy-MM-dd');
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
                                                            <td colSpan={4} className="p-2">
                                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full">
                                                                    [ BLOQUEADO ] {row.motivo} — Aula não realizada neste dia
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                const conf = conflitosInstrutor[row.idx];
                                                return (
                                                    <tr key={row.idx} className={`transition-colors ${conf ? 'bg-red-50 dark:bg-red-900/15 hover:bg-red-100/70 dark:hover:bg-red-900/25' : 'hover:bg-slate-50 dark:hover:bg-slate-750'}`}>
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
                                                        <td className="p-2">
                                                            <span className={`text-xs truncate block ${conf ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                                                                {(row.cls as any).instrutorNome || <span className="text-slate-400 italic">(definir depois)</span>}
                                                            </span>
                                                            {conf && (
                                                                <span className="block text-[10px] text-red-600 dark:text-red-400 mt-0.5 truncate" title={`Já ocupado: ${conf.existente}`}>
                                                                    ⚠ já ocupado: {conf.existente}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => removeClass(row.idx)}
                                                                className="text-[10px] font-black text-rose-600 hover:bg-rose-50 px-2 py-1 border border-rose-100 rounded uppercase tracking-widest transition-colors"
                                                            >
                                                                Apagar
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
                        <div className="mt-4 p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-3 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                            [ ! ] ERRO: {error}
                        </div>
                    )}
                </div>

                {/* Footer fixed */}
                <div className="p-5 border-t border-slate-200 flex justify-between bg-slate-50 shrink-0 dark:bg-slate-800 dark:border-slate-700">
                    {step === 'config' ? (
                        <div className="ml-auto w-full md:w-auto">
                            <button
                                onClick={handleGenerateEngine}
                                className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-black flex items-center justify-center gap-2 transition-transform active:scale-95 text-[10px] uppercase tracking-widest"
                            >
                                PROJETAR AUTOMÁTICO
                            </button>
                        </div>
                    ) : step === 'preview' ? (
                        <>
                            <button
                                onClick={() => setStep('config')}
                                className="px-5 py-2.5 text-slate-800 font-black hover:bg-slate-200 rounded-xl flex items-center gap-2 transition dark:text-slate-300 dark:hover:bg-slate-700 uppercase tracking-widest text-[10px]"
                            >
                                [ VOLTAR ]
                            </button>
                            <button
                                onClick={handleConfirmAndSave}
                                disabled={isSaving}
                                className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 border border-emerald-500 rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-200 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'SALVANDO MULTIDÃO DE AULAS...' : 'REALIZAR ABERTURA DE TURMA (GRAVAR)'}
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
