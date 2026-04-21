import React, { useState, useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services'; // Import service directly
import { supabase } from '../lib/supabase'; // FIX: Import supabase for auth token
import { format, addDays, parseISO, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ScheduleGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
}

interface GeneratedClass {
    date: string;
    startTime: string;
    endTime: string;
    subjectId: string;
    subjectName: string;
    summary?: string;
}

export const ScheduleGenerator: React.FC<ScheduleGeneratorProps> = ({ isOpen, onClose }) => {
    const { cursos, materias, instrutores, refreshData, setCurrentDate } = useSchedule();




    // State
    const [step, setStep] = useState<'config' | 'generating' | 'preview'>('config');
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [selectedInstructorId, setSelectedInstructorId] = useState(''); // Default instructor
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

    // Split Shift Logic
    const [shift1Start, setShift1Start] = useState('08:00');
    const [shift1End, setShift1End] = useState('12:00');
    const [shift2Start, setShift2Start] = useState('13:00');
    const [shift2End, setShift2End] = useState('17:00');

    const [guidelines, setGuidelines] = useState(''); // New: Guidelines text
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
    const [targetCourseNumber, setTargetCourseNumber] = useState(''); // NEW: Mandatory Course Number
    const [selectedRoom, setSelectedRoom] = useState(''); // NEW: Default Room

    // Augmented schedule item with local override ability
    const [generatedSchedule, setGeneratedSchedule] = useState<(GeneratedClass & { assignedInstructorId?: string })[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Use 'cursos' directly instead of filtering. Filter logic moved to validation.
    // const viableCourses = useMemo(() => {
    //    return cursos.filter(c => materias.some(m => m.cursoId === c.id));
    // }, [cursos, materias]);

    const activeSubjects = useMemo(() => {
        if (!selectedCourseId) return [];
        return materias.filter(m => m.cursoId === selectedCourseId);
    }, [selectedCourseId, materias]);

    const handleDayToggle = (day: number) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
    };

    const handleCourseChange = (courseId: string) => {
        setSelectedCourseId(courseId);
        const course = cursos.find(c => c.id === courseId);
        if (course) {
            setTargetCourseNumber(course.numeroCurso || '');
        } else {
            setTargetCourseNumber('');
        }
    };

    const handleInstructorChange = (idx: number, instructorId: string) => {
        setGeneratedSchedule(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], assignedInstructorId: instructorId };
            return next;
        });
    };

    const handleGenerate = async () => {
        if (!selectedCourseId) return setError('Selecione um curso.');
        if (!targetCourseNumber.trim()) return setError('O número da turma é obrigatório.');
        // Instructor now optional at start, but mandatory before saving
        if (selectedDays.length === 0) return setError('Selecione pelo menos um dia da semana.');

        setError(null);
        setStep('generating');

        try {
            const course = cursos.find(c => c.id === selectedCourseId);

            // Construct Time Slots based on inputs
            const timeSlots = [];
            if (shift1Start && shift1End) timeSlots.push({ start: shift1Start, end: shift1End });
            if (shift2Start && shift2End) timeSlots.push({ start: shift2Start, end: shift2End });

            if (timeSlots.length === 0) {
                throw new Error("Defina pelo menos um turno de horário.");
            }

            const payload = {
                courseName: course?.nome,
                subjects: activeSubjects.map(m => ({
                    id: m.id,
                    nome: m.nome, // Keep name for debug/legacy
                    cargaHoraria: m.cargaHoraria
                })),
                startDate,
                timeSlots, // Send Array of Slots
                daysOfWeek: selectedDays,
                excludedDates: [],
                guidelines
            };

            // Increase timeout to 120s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            // FIX: Get Session Token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const headers: HeadersInit = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/generate-schedule', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) throw new Error('Sessão expirada. Faça login novamente.');
                const errText = await response.text();
                throw new Error(`Falha: ${errText}`);
            }

            const data = await response.json();

            if (data.error) throw new Error(data.error);

            // Pre-fill with default instructor if selected
            const scheduleWithInstructor = (data.schedule || []).map((cls: GeneratedClass) => ({
                ...cls,
                assignedInstructorId: selectedInstructorId || ''
            }));

            setGeneratedSchedule(scheduleWithInstructor);
            setStep('preview');

        } catch (err: any) {
            console.error(err);
            if (err.name === 'AbortError' || err.message.includes('aborted')) {
                setError('Tempo esgotado (90s). A IA pode estar sobrecarregada. Tente novamente em alguns segundos.');
            } else {
                setError(err.message || 'Erro desconhecido.');
            }
            setStep('config');
        }
    };

    // --- EDITING HELPERS ---
    const updateClass = (index: number, field: keyof GeneratedClass | 'assignedInstructorId', value: string) => {
        setGeneratedSchedule(prev => {
            const next = [...prev];
            // @ts-ignore
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const removeClass = (index: number) => {
        setGeneratedSchedule(prev => prev.filter((_, i) => i !== index));
    };

    const addClass = () => {
        setGeneratedSchedule(prev => {
            const lastClass = prev[prev.length - 1];
            let newDate = startDate;
            let newStartTime = shift1Start || "08:00";
            let newEndTime = shift1End || "10:00";

            if (lastClass) {
                // Smart default: Next day same time, or same day next slot?
                // Simple: Same day, +1 hour? 
                // Let's just duplicate the last one as a template but clear subject
                try {
                    const d = parseISO(lastClass.date);
                    newDate = format(addDays(d, 1), 'yyyy-MM-dd'); // Next day by default
                } catch (e) { }
                newStartTime = lastClass.startTime;
                newEndTime = lastClass.endTime;
            }

            return [...prev, {
                date: newDate,
                startTime: newStartTime,
                endTime: newEndTime,
                subjectId: '',
                subjectName: 'Nova Aula',
                assignedInstructorId: selectedInstructorId || ''
            }];
        });
    };

    const updateDuration = (index: number, newHours: string) => {
        const hours = parseFloat(newHours);
        if (isNaN(hours) || hours <= 0) return; // Prevent invalid inputs

        setGeneratedSchedule(prev => {
            const next = [...prev];
            const cls = next[index];
            if (!cls.startTime) return next;

            try {
                // Create a base date for calculation (date doesn't matter, only time)
                const baseDate = parseISO(`2000-01-01T${cls.startTime}:00`);
                const minutesToAdd = Math.round(hours * 60);
                const newEndDate = addMinutes(baseDate, minutesToAdd);
                const newEndTime = format(newEndDate, 'HH:mm');

                next[index] = { ...cls, endTime: newEndTime };
            } catch (e) {
                console.error("Error updating duration", e);
            }
            return next;
        });
    };

    // --- REACTIVE AUDIT STATS ---
    const auditStats = useMemo(() => {
        if (!generatedSchedule) return [];
        return activeSubjects.map(subj => {
            const planned = Number(subj.cargaHoraria) || 0;

            // Calculate Used Hours from generatedSchedule
            const used = generatedSchedule.reduce((acc, cls) => {
                // Match by ID preferred, fallback to Name
                const isMatch = cls.subjectId === subj.id ||
                    (!cls.subjectId && cls.subjectName && cls.subjectName.toLowerCase().trim() === subj.nome.toLowerCase().trim());

                if (isMatch) {
                    const [hStart, mStart] = cls.startTime.split(':').map(Number);
                    const [hEnd, mEnd] = cls.endTime.split(':').map(Number);
                    if (!isNaN(hStart) && !isNaN(hEnd)) {
                        const duration = ((hEnd * 60 + mEnd) - (hStart * 60 + mStart)) / 60;
                        return acc + (duration > 0 ? duration : 0);
                    }
                }
                return acc;
            }, 0);

            return {
                id: subj.id,
                name: subj.nome,
                planned,
                used,
                diff: used - planned,
                status: Math.abs(used - planned) < 0.1 ? 'ok' : (used < planned ? 'under' : 'over')
            };
        });
    }, [generatedSchedule, activeSubjects]);

    const handleConfirm = async () => {
        // Validate all classes have instructors
        const missingInstructor = generatedSchedule.some(c => !c.assignedInstructorId);
        if (missingInstructor) {
            alert('Atenção: Existem aulas sem instrutor definido. Por favor, atribua um instrutor para todas as aulas na tabela.');
            return;
        }

        if (generatedSchedule.length === 0) return;
        setIsSaving(true);

        const results = {
            success: 0,
            failures: [] as string[]
        };

        try {
            // SEQUENTIAL EXECUTION to ensure proper conflict checking between items in the batch
            for (const cls of generatedSchedule) {
                // Try EXACT ID Match first
                let subject = activeSubjects.find(s => s.id === cls.subjectId);

                // Fallback to Name Match
                if (!subject) {
                    subject = activeSubjects.find(s =>
                        s.nome.toLowerCase().trim() === cls.subjectName.toLowerCase().trim() ||
                        cls.subjectName.toLowerCase().includes(s.nome.toLowerCase())
                    );
                }

                if (!subject) {
                    results.failures.push(`Matéria não encontrada: ${cls.subjectName}`);
                    continue;
                }

                const result = await aulaService.create({
                    curso_id: selectedCourseId,
                    materia_id: subject.id,
                    instrutor_id: cls.assignedInstructorId!,
                    data: cls.date,
                    horario_inicio: cls.startTime,
                    horario_fim: cls.endTime,
                    status: 'agendada',
                    observacoes: cls.summary,
                    numero_turma: targetCourseNumber,
                    sala: selectedRoom
                } as any);

                if (result.success) {
                    results.success++;
                } else {
                    // Smart Error Formatting
                    let msg = `Erro na aula de ${cls.date} (${cls.startTime}): `;
                    if (result.warning === 'INSTRUCTOR_CONFLICT') {
                        msg += 'Instrutor já possui aula neste horário.';
                    } else if (result.warning === 'ROOM_CONFLICT') {
                        msg += 'Sala ocupada neste horário.';
                    } else {
                        msg += result.error || 'Erro desconhecido.';
                    }
                    results.failures.push(msg);
                }
            }

            if (results.success > 0) {
                let msg = `Processamento finalizado!\n\n✅ ${results.success} aulas criadas com sucesso.`;
                if (results.failures.length > 0) {
                    msg += `\n\n❌ ${results.failures.length} aulas falharam:\n${results.failures.slice(0, 5).join('\n')}`;
                    if (results.failures.length > 5) msg += `\n...e mais ${results.failures.length - 5} erros.`;
                }
                alert(msg);
                await refreshData();
                setCurrentDate(parseISO(startDate));
                onClose();
            } else {
                alert(`Falha total. Nenhuma aula foi criada.\n\nErros:\n${results.failures.join('\n')}`);
            }

        } catch (err: any) {
            console.error(err);
            alert('Erro crítico do sistema ao salvar.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
                    <div className="flex items-center gap-2">
                        <div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Criador de Grade</h2>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Geração Automática</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-black font-black text-xl px-2">FECHAR</button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'config' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                {/* Left Column */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Curso</label>
                                    <select
                                        value={selectedCourseId}
                                        onChange={e => handleCourseChange(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                    >
                                        <option value="">Selecione um curso...</option>
                                        {cursos.map(c => (
                                            <option key={c.id} value={c.id}>{c.numeroCurso ? `${c.numeroCurso} - ` : ''}{c.nome}</option>
                                        ))}
                                    </select>
                                    {selectedCourseId && activeSubjects.length === 0 && (
                                        <p className="text-[10px] font-black text-rose-600 mt-1 uppercase tracking-tighter">
                                            ! Este curso não possui matérias cadastradas.
                                        </p>
                                    )}
                                </div>



                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                        Número da Turma (Ex: T01-2026)
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={targetCourseNumber}
                                        onChange={e => setTargetCourseNumber(e.target.value)}
                                        placeholder="Digite o identificador da turma..."
                                        className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-mono ${!targetCourseNumber.trim() && error ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Este número identifica o curso no Dashboard e nos relatórios.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Instrutor Padrão (Opcional)</label>
                                    <select
                                        value={selectedInstructorId}
                                        onChange={e => setSelectedInstructorId(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                    >
                                        <option value="">Definir depois na tabela...</option>
                                        {instrutores.map(i => (
                                            <option key={i.id} value={i.id}>{i.nome}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Você poderá alterar o instrutor de cada aula individualmente depois.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sala Padrão (Opcional)</label>
                                    <input
                                        type="text"
                                        value={selectedRoom}
                                        onChange={e => setSelectedRoom(e.target.value)}
                                        placeholder="Ex: Sala 01, Lab C..."
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={e => setStartDate(e.target.value)}
                                            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dias da Semana</label>
                                        <div className="flex gap-1 justify-between mt-1">
                                            {[1, 2, 3, 4, 5, 6, 0].map(day => {
                                                const displayLabels: Record<number, string> = {
                                                    1: 'S', 2: 'T', 3: 'Q', 4: 'Q', 5: 'S', 6: 'S', 0: 'D'
                                                };

                                                const isSelected = selectedDays.includes(day);
                                                return (
                                                    <button
                                                        key={day}
                                                        onClick={() => handleDayToggle(day)}
                                                        className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                            }`}
                                                        title={day === 0 ? 'Domingo' : ''}
                                                    >
                                                        {displayLabels[day]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Right Column - Advanced */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Horários (Turnos)</label>
                                    <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">

                                        {/* Shift 1 */}
                                        <div>
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Turno da Manhã (1º Período)</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="time"
                                                    value={shift1Start}
                                                    onChange={e => setShift1Start(e.target.value)}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <span className="text-gray-400 font-bold">-</span>
                                                <input
                                                    type="time"
                                                    value={shift1End}
                                                    onChange={e => setShift1End(e.target.value)}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                        </div>

                                        {/* Shift 2 */}
                                        <div>
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Turno da Tarde (2º Período)</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="time"
                                                    value={shift2Start}
                                                    onChange={e => setShift2Start(e.target.value)}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <span className="text-gray-400 font-bold">-</span>
                                                <input
                                                    type="time"
                                                    value={shift2End}
                                                    onChange={e => setShift2End(e.target.value)}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                        </div>

                                        <p className="text-[10px] text-gray-500">
                                            O "Intervalo de Almoço" será o tempo entre o fim do 1º turno e o início do 2º.
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-gray-700 mb-1 uppercase tracking-widest flex items-center gap-2">
                                        Diretrizes Pedagógicas
                                    </label>
                                    <textarea
                                        value={guidelines}
                                        onChange={e => setGuidelines(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm h-32 resize-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Ex: Comece com Introdução e termine com Prática. Evite aulas na sexta-feira à tarde..."
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Dê instruções especiais para o Agente personalizar seu cronograma.</p>
                                </div>
                            </div>

                        </div>
                    )}

                    {step === 'generating' && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mt-6">Criando a Grade Perfeita...</h3>
                            <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                                O Agente está analisando suas diretrizes e distribuindo as cargas horárias.
                            </p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4 h-full flex flex-col">
                            {/* AUDIT SUMMARY (Reactive) */}
                            {(() => {
                                const hasErrors = auditStats.some(s => s.status !== 'ok');
                                return (
                                    <div className={`p-4 rounded-lg border text-sm ${hasErrors ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className={`font-black uppercase tracking-widest flex items-center gap-2 ${hasErrors ? 'text-amber-800' : 'text-blue-800'}`}>
                                                {hasErrors ? '!' : 'OK'} Auditoria de Carga Horária
                                            </h3>
                                            <span className="text-xs font-mono opacity-80">
                                                Total Previsto: {auditStats.reduce((a, b) => a + b.planned, 0)}h |
                                                Agendado: {auditStats.reduce((a, b) => a + Number(b.used.toFixed(1)), 0)}h
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {auditStats.map(stat => (
                                                <div key={stat.id} className={`
                                                    flex justify-between items-center p-2 rounded border
                                                    ${stat.status === 'ok' ? 'bg-white border-green-200 opacity-60' :
                                                        stat.status === 'under' ? 'bg-red-50 border-red-200 min-w-0' : 'bg-yellow-50 border-yellow-200 min-w-0'}
                                                `}>
                                                    <span className="truncate flex-1 font-medium pr-2 text-xs" title={stat.name}>{stat.name}</span>
                                                    <div className="flex flex-col items-end leading-none shrink-0">
                                                        <span className={`font-bold text-xs ${stat.status === 'ok' ? 'text-green-700' : stat.status === 'under' ? 'text-red-700' : 'text-yellow-700'}`}>
                                                            {stat.used.toFixed(1)}h <span className="text-gray-400 font-normal">/ {stat.planned}h</span>
                                                        </span>
                                                        {stat.status !== 'ok' && (
                                                            <span className="text-[9px] uppercase font-bold tracking-wider mt-0.5">
                                                                {stat.status === 'under' ? `Faltam ${Math.abs(stat.diff).toFixed(1)}h` : `Excesso ${stat.diff.toFixed(1)}h`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg border border-green-100 shrink-0">
                                <div>
                                    <h3 className="font-bold text-green-800">Editor de Proposta</h3>
                                    <p className="text-sm text-green-700">Edite as aulas abaixo para corrigir divergências antes de salvar.</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-2xl font-bold text-green-800">{generatedSchedule.length}</span>
                                    <span className="text-xs text-green-600 uppercase font-bold">Aulas</span>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-lg overflow-hidden flex-1 overflow-y-auto bg-white">
                                <table className="w-full text-left text-sm relative">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm text-xs uppercase tracking-wider text-gray-500">
                                        <tr>
                                            <th className="p-3 w-32">Data</th>
                                            <th className="p-3 w-40">Horário</th>
                                            <th className="p-3 w-20 text-center" title="Duração em horas">Carga</th>
                                            <th className="p-3">Matéria</th>
                                            <th className="p-3 w-48">Instrutor</th>
                                            <th className="p-3 w-10 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {generatedSchedule.map((cls, idx) => {
                                            const stat = auditStats.find(s => s.id === cls.subjectId) ||
                                                auditStats.find(s => s.name.toLowerCase() === cls.subjectName.toLowerCase());

                                            const rowBg = stat && stat.status !== 'ok' ? 'bg-yellow-50/30' : '';

                                            return (
                                                <tr key={idx} className={`hover:bg-gray-50 group transition-colors ${rowBg}`}>
                                                    <td className="p-2">
                                                        <input
                                                            type="date"
                                                            value={cls.date}
                                                            onChange={e => updateClass(idx, 'date', e.target.value)}
                                                            className="w-full text-xs p-1.5 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent focus:bg-white transition-all outline-none"
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="time"
                                                                value={cls.startTime}
                                                                onChange={e => updateClass(idx, 'startTime', e.target.value)}
                                                                className="w-full text-xs p-1.5 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent focus:bg-white transition-all outline-none"
                                                            />
                                                            <span className="text-gray-300">-</span>
                                                            <input
                                                                type="time"
                                                                value={cls.endTime}
                                                                onChange={e => updateClass(idx, 'endTime', e.target.value)}
                                                                className="w-full text-xs p-1.5 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent focus:bg-white transition-all outline-none"
                                                            />
                                                        </div>
                                                    </td>

                                                    <td className="p-2">
                                                        {(() => {
                                                            const [h1, m1] = cls.startTime.split(':').map(Number);
                                                            const [h2, m2] = cls.endTime.split(':').map(Number);
                                                            let duration = 0;
                                                            if (!isNaN(h1) && !isNaN(h2)) {
                                                                duration = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
                                                            }
                                                            return (
                                                                <input
                                                                    type="number"
                                                                    min="0.5"
                                                                    step="0.5"
                                                                    value={duration > 0 ? duration : ''}
                                                                    onChange={e => updateDuration(idx, e.target.value)}
                                                                    className="w-full text-xs p-1.5 text-center font-bold text-gray-700 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent focus:bg-white transition-all outline-none"
                                                                />
                                                            );
                                                        })()}
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            value={cls.subjectId || ''}
                                                            onChange={e => {
                                                                const s = activeSubjects.find(sub => sub.id === e.target.value);
                                                                updateClass(idx, 'subjectId', e.target.value);
                                                                if (s) updateClass(idx, 'subjectName', s.nome);
                                                            }}
                                                            className="w-full text-xs p-1.5 border border-transparent hover:border-gray-300 focus:border-indigo-500 rounded bg-transparent focus:bg-white transition-all outline-none font-medium text-gray-700 truncate"
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {activeSubjects.map(s => (
                                                                <option key={s.id} value={s.id}>{s.nome}</option>
                                                            ))}
                                                        </select>
                                                        {(!cls.subjectId && !activeSubjects.find(s => s.nome === cls.subjectName)) && (
                                                            <div className="text-[10px] text-red-500 font-bold mt-1">Matéria inválida</div>
                                                        )}
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            value={cls.assignedInstructorId || ''}
                                                            onChange={(e) => updateClass(idx, 'assignedInstructorId', e.target.value)}
                                                            className={`w-full text-xs p-1.5 border rounded transition-all outline-none
                                                                ${!cls.assignedInstructorId ? 'border-red-300 bg-red-50' : 'border-transparent hover:border-gray-300 bg-transparent focus:bg-white'}
                                                            `}
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {instrutores.map(i => (
                                                                <option key={i.id} value={i.id}>{i.nome}</option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        <button
                                                            onClick={() => removeClass(idx)}
                                                            className="text-gray-300 hover:text-red-600 font-black text-[10px] uppercase p-1 transition-colors"
                                                            title="Remover aula"
                                                        >
                                                            EXCLUIR
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <button
                                onClick={addClass}
                                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-medium text-sm"
                            >
                                <span className="font-black">ADICIONAR NOVA AULA MANUALMENTE</span>
                            </button>
                        </div>
                    )}

                    {error && step === 'config' && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
                             <span className="font-bold">[ ! ]</span> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50/50 shrink-0">
                    {step === 'config' ? (
                        <div className="ml-auto w-full md:w-auto">
                            <button
                                onClick={handleGenerate}
                                className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                <span className="font-black uppercase">Gerar Proposta via AI</span>
                            </button>
                        </div>
                    ) : step === 'preview' ? (
                        <>
                            <button
                                onClick={() => setStep('config')}
                                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg flex items-center gap-1"
                            >
                                <span className="font-black uppercase tracking-widest">&lt; Voltar</span>
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-lg shadow-green-200 font-bold flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <span className="animate-spin text-lg">/</span> : <span className="text-lg font-bold">OK</span>}
                                {isSaving ? 'Salvando...' : 'Aprovar e Criar Aulas'}
                            </button>
                        </>
                    ) : (
                        <div />
                    )}
                </div>
            </div>
        </div>
    );
};
