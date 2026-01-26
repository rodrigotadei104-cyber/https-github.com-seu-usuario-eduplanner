
import React, { useState, useMemo } from 'react';
import { X, Calendar, Clock, Sparkles, CheckCircle, ChevronRight, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services'; // Import service directly
import { format, addDays } from 'date-fns';
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
    const { cursos, materias, instrutores } = useSchedule();

    // State
    const [step, setStep] = useState<'config' | 'generating' | 'preview'>('config');
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [selectedInstructorId, setSelectedInstructorId] = useState(''); // Default instructor
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('08:00');
    const [endTime, setEndTime] = useState('17:00');
    const [breakDuration, setBreakDuration] = useState('60'); // New: Break duration in mins
    const [guidelines, setGuidelines] = useState(''); // New: Guidelines text
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default

    // Augmented schedule item with local override ability
    const [generatedSchedule, setGeneratedSchedule] = useState<(GeneratedClass & { assignedInstructorId?: string })[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter courses that have subjects
    const viableCourses = useMemo(() => {
        return cursos.filter(c => materias.some(m => m.cursoId === c.id));
    }, [cursos, materias]);

    const activeSubjects = useMemo(() => {
        if (!selectedCourseId) return [];
        return materias.filter(m => m.cursoId === selectedCourseId);
    }, [selectedCourseId, materias]);

    const handleDayToggle = (day: number) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
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
        // Instructor now optional at start, but mandatory before saving
        if (selectedDays.length === 0) return setError('Selecione pelo menos um dia da semana.');

        setError(null);
        setStep('generating');

        try {
            const course = cursos.find(c => c.id === selectedCourseId);

            const payload = {
                courseName: course?.nome,
                subjects: activeSubjects.map(m => ({
                    id: m.id,
                    nome: m.nome,
                    cargaHoraria: m.cargaHoraria
                })),
                startDate,
                timeSlot: { start: startTime, end: endTime },
                daysOfWeek: selectedDays,
                excludedDates: [],
                breakDuration: parseInt(breakDuration) || 60,
                guidelines
            };

            // Increase timeout to 90s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

            const response = await fetch('/api/generate-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
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

    const handleConfirm = async () => {
        // Validate all classes have instructors
        const missingInstructor = generatedSchedule.some(c => !c.assignedInstructorId);
        if (missingInstructor) {
            alert('Atenção: Existem aulas sem instrutor definido. Por favor, atribua um instrutor para todas as aulas na tabela.');
            return;
        }

        if (generatedSchedule.length === 0) return;
        setIsSaving(true);
        let successCount = 0;
        let failCount = 0;

        try {
            // Sequential creation
            await Promise.all(generatedSchedule.map(async (cls) => {
                const subject = activeSubjects.find(s =>
                    s.nome.toLowerCase().trim() === cls.subjectName.toLowerCase().trim() ||
                    cls.subjectName.toLowerCase().includes(s.nome.toLowerCase())
                );

                if (!subject) {
                    console.warn(`Matéria não encontrada para: ${cls.subjectName}`);
                    failCount++;
                    return;
                }

                const result = await aulaService.create({
                    curso_id: selectedCourseId,
                    materia_id: subject.id,
                    instrutor_id: cls.assignedInstructorId!, // Guaranteed by check above
                    data: cls.date,
                    horario_inicio: cls.startTime,
                    horario_fim: cls.endTime,
                    status: 'agendada',
                } as any);

                if (result.success) {
                    successCount++;
                } else {
                    console.error('Failed to save class:', result.error);
                    failCount++;
                }
            }));

            if (successCount > 0) {
                alert(`Cronograma criado com sucesso! ${successCount} aulas agendadas.` + (failCount > 0 ? ` (${failCount} falharam)` : ''));
                onClose();
                // FORCE REFRESH to update Dashboard
                window.location.reload();
            } else {
                alert(`Falha ao salvar aulas. Verifique conflitos de horário. (${failCount} erros)`);
            }

        } catch (err: any) {
            console.error(err);
            alert('Erro crítico ao salvar aulas. Verifique o console.');
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
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Agente Criador</h2>
                            <p className="text-xs text-gray-500">Geração Automática de Cronograma (Gemini 2.0)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
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
                                        onChange={e => setSelectedCourseId(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                                    >
                                        <option value="">Selecione um curso...</option>
                                        {viableCourses.map(c => (
                                            <option key={c.id} value={c.id}>{c.numeroCurso ? `${c.numeroCurso} - ` : ''}{c.nome}</option>
                                        ))}
                                    </select>
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
                                                const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // 0=Dom (index 0 for display logic adjustment below)
                                                // Adjust label index logic: day 0 is 'D', day 1 is 'S' etc.
                                                // Simplified labels array mapping directly to day integer if ordered 0-6
                                                // But here we iterate [1,2,3,4,5,6,0]. 
                                                // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab, 0=Dom
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Horário Aula</label>
                                        <div className="flex items-center gap-1">
                                            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2 border rounded text-sm" />
                                            <span>-</span>
                                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2 border rounded text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Intervalo (min)</label>
                                        <input
                                            type="number"
                                            value={breakDuration}
                                            onChange={e => setBreakDuration(e.target.value)}
                                            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                                            placeholder="60"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                        <Sparkles size={14} className="text-indigo-500" />
                                        Diretrizes Pedagógicas (IA)
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
                                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Sparkles size={24} className="text-indigo-500 animate-pulse" />
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mt-6">Criando a Grade Perfeita...</h3>
                            <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                                O Agente está analisando suas diretrizes e distribuindo as cargas horárias.
                            </p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg border border-green-100 shrink-0">
                                <div>
                                    <h3 className="font-bold text-green-800">Proposta Gerada</h3>
                                    <p className="text-sm text-green-700">Ajuste os instrutores antes de salvar.</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-2xl font-bold text-green-800">{generatedSchedule.length}</span>
                                    <span className="text-xs text-green-600 uppercase font-bold">Aulas</span>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
                                <table className="w-full text-left text-sm relative">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-3 font-medium text-gray-500 w-32">Data</th>
                                            <th className="p-3 font-medium text-gray-500 w-32">Horário</th>
                                            <th className="p-3 font-medium text-gray-500">Matéria</th>
                                            <th className="p-3 font-medium text-gray-500 w-48">Instrutor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {generatedSchedule.map((cls, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 group">
                                                <td className="p-3 whitespace-nowrap text-gray-600">
                                                    {format(new Date(cls.date + 'T12:00:00'), "dd/MM (EEE)", { locale: ptBR })}
                                                </td>
                                                <td className="p-3 whitespace-nowrap text-gray-600">
                                                    {cls.startTime} - {cls.endTime}
                                                </td>
                                                <td className="p-3 font-medium text-gray-800">
                                                    {cls.subjectName}
                                                </td>
                                                <td className="p-2">
                                                    <select
                                                        value={cls.assignedInstructorId || ''}
                                                        onChange={(e) => handleInstructorChange(idx, e.target.value)}
                                                        className={`w-full p-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500
                                                            ${!cls.assignedInstructorId ? 'border-red-300 bg-red-50' : 'border-gray-300'}
                                                        `}
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {instrutores.map(i => (
                                                            <option key={i.id} value={i.id}>{i.nome}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {error && step === 'config' && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle size={16} /> {error}
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
                                <Sparkles size={18} /> Gerar Proposta
                            </button>
                        </div>
                    ) : step === 'preview' ? (
                        <>
                            <button
                                onClick={() => setStep('config')}
                                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg flex items-center gap-1"
                            >
                                <ArrowLeft size={16} /> Voltar e Ajustar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-lg shadow-green-200 font-bold flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
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
