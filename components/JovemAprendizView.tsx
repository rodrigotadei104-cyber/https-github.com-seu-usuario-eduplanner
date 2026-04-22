import React, { useState, useMemo, useEffect } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { format, getDaysInMonth, startOfMonth, addDays, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
// Icons removed for minimalism

export const JovemAprendizView: React.FC = () => {
    const { aulas, addAulaPrograma, instrutores, currentDate, setCurrentDate, deleteAulaPrograma, feriados, feriadosSet } = useSchedule();
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Estado local de programas (persistido no localStorage)
    const defaultPrograms = ['Assist. Adm Integral', 'Assist. Adm Manhã', 'Assist. Adm Tarde', 'Assist. Log', 'Aprendiz'];
    const [programs, setPrograms] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('eduplanner_programas');
            if (!saved) return defaultPrograms;
            
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) return defaultPrograms;

            // MIGRATION: Convert old object format {id, name} to string if necessary
            return parsed.map(p => {
                if (typeof p === 'object' && p !== null) {
                    return p.name || p.id || String(p);
                }
                return String(p);
            });
        } catch (e) {
            console.error('Erro ao carregar programas:', e);
            return defaultPrograms;
        }
    });

    const [newProgramName, setNewProgramName] = useState('');
    const [newProgramStart, setNewProgramStart] = useState('08:00');
    const [newProgramEnd, setNewProgramEnd] = useState('12:00');

    useEffect(() => {
        localStorage.setItem('eduplanner_programas', JSON.stringify(programs));
    }, [programs]);

    // SYNC: Mesclar programas do banco (origens das aulas PROGRAMA) com programas locais.
    // Garante que colunas criadas por outros usuários (ex: admin Wilson) apareçam para todos.
    useEffect(() => {
        const origensNoBanco = new Set<string>();
        aulas.forEach(a => {
            if (a.tipoAula === 'PROGRAMA' && a.origem) {
                origensNoBanco.add(a.origem);
            }
        });

        if (origensNoBanco.size === 0) return;

        setPrograms(prev => {
            const merged = new Set(prev);
            let changed = false;
            origensNoBanco.forEach(origem => {
                if (!merged.has(origem)) {
                    merged.add(origem);
                    changed = true;
                }
            });
            if (!changed) return prev; // evita re-render desnecessário
            return Array.from(merged);
        });
    }, [aulas]);

    const addProgram = () => {
        if (newProgramName.trim()) {
            const finalName = `${newProgramName.trim()} [${newProgramStart}-${newProgramEnd}]`;
            if (!programs.includes(finalName)) {
                setPrograms([...programs, finalName]);
                setNewProgramName('');
                setNewProgramStart('08:00');
                setNewProgramEnd('12:00');
            }
        }
    };

    const removeProgram = (prog: string) => {
        setPrograms(programs.filter(p => p !== prog));
    };

    // Dates generation for the month
    const daysInMonth = getDaysInMonth(currentDate);
    const startDate = startOfMonth(currentDate);
    const days = Array.from({ length: daysInMonth }).map((_, i) => addDays(startDate, i));

    // Aulas do Programa (apenas deste mês para otimização visual)
    const programAulas = useMemo(() => {
        return aulas.filter(a => {
            const aDate = a.data instanceof Date ? a.data : new Date(a.data);
            return (
                a.tipoAula === 'PROGRAMA' && 
                aDate.getMonth() === currentDate.getMonth() && 
                aDate.getFullYear() === currentDate.getFullYear()
            );
        });
    }, [aulas, currentDate]);

    // Lógica para determinar horário (Regex customizado ou Fallback Heurístico)
    const guessTimeForProgram = (programName: string) => {
        const timeMatch = programName.match(/\[(\d{2}:\d{2})-(\d{2}:\d{2})\]/);
        if (timeMatch) return { start: timeMatch[1], end: timeMatch[2] };

        const p = programName.toLowerCase();
        if (p.includes('integral')) return { start: '08:00', end: '17:00' };
        if (p.includes('tarde') || p.includes('vespertino')) return { start: '13:00', end: '17:00' };
        if (p.includes('manhã') || p.includes('matutino') || p.includes('manha')) return { start: '08:00', end: '12:00' };
        return { start: '08:00', end: '12:00' }; // Default
    };

    // Handle modification
    const handleCellChange = async (date: Date, programName: string, instructorId: string) => {
        // Encontrar aula existente (só assumimos 1 por programa/dia nesta view simplificada)
        const existingClass = programAulas.find(a => 
            isSameDay(new Date(a.data), date) && a.origem === programName
        );

        if (!instructorId) {
            if (existingClass) {
                // Remove class Se o usuário selecionou 'Vazio'
                await deleteAulaPrograma(existingClass.id);
            }
            return;
        }

        const instrutorObj = instrutores.find(i => i.id === instructorId);
        if (!instrutorObj) return;

        const time = guessTimeForProgram(programName);

        const res = await addAulaPrograma({
            data: date,
            horarioInicio: time.start,
            horarioFim: time.end,
            instrutor: instrutorObj.nome,
            instrutorId: instrutorObj.id, // Enviar ID fixo para o sistema
            curso: 'Institucional', 
            materia: programName.replace(/\s*\[\d{2}:\d{2}-\d{2}:\d{2}\]/, ''),   
            status: 'agendada',
            tipoAula: 'PROGRAMA',
            origem: programName,
            contabilizaCarga: true
        });

        if (res.warning === 'INSTRUCTOR_CONFLICT') {
             alert('Atenção: Este instrutor já tem aula neste horário!');
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800">
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-200 shrink-0 flex justify-between items-center z-10 dark:bg-slate-900 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 text-white rounded-lg font-black text-xl shadow-sm">
                        JA
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                            Jovem Aprendiz
                        </h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-70">Sincronização Institucional</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Month Picker */}
                    <div className="flex items-center bg-slate-200 rounded-lg p-1 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                        <button
                            onClick={() => setCurrentDate(addDays(startOfMonth(currentDate), -1))}
                            className="px-2.5 py-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors text-slate-800 dark:text-white font-black"
                        >
                            &lt;
                        </button>
                        <span className="min-w-[120px] text-center text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
                            {format(currentDate, "MMMM ''yy", { locale: ptBR })}
                        </span>
                        <button
                            onClick={() => setCurrentDate(addDays(startOfMonth(currentDate), 32))}
                            className="px-2.5 py-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors text-slate-800 dark:text-white font-black"
                        >
                            &gt;
                        </button>
                    </div>

                    <button 
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                        className={`px-4 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-widest ${isConfigOpen ? 'bg-amber-500 text-white border-amber-600 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                        Colunas
                    </button>
                </div>
            </div>

            {/* Config Panel */}
            {isConfigOpen && (
                <div className="bg-amber-50 border-b border-amber-200 p-4 dark:bg-amber-900/10 dark:border-amber-900/30 flex items-start gap-6 shadow-inner transition-all">
                    <div className="bg-amber-100 text-amber-700 w-8 h-8 flex items-center justify-center rounded-lg dark:bg-amber-900/40 dark:text-amber-400 shrink-0 mt-1 font-black">
                        !
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-400 mb-2">Gerenciar Programas (Colunas)</h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {programs.map(p => (
                                <div key={p} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700/50 px-3 py-1.5 rounded-md shadow-sm group">
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                                        {p.replace(/\s*\[\d{2}:\d{2}-\d{2}:\d{2}\]/, '')}
                                    </span>
                                    <button onClick={() => removeProgram(p)} className="text-slate-400 hover:text-red-600 font-bold text-[10px] p-1">[X]</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 max-w-lg items-center">
                            <input 
                                type="text"
                                value={newProgramName}
                                onChange={e => setNewProgramName(e.target.value)}
                                placeholder="Nome do novo programa..."
                                className="flex-1 text-sm p-2 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-700 h-9"
                            />
                            <div className="flex bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden h-9">
                                <input 
                                    type="time" 
                                    value={newProgramStart}
                                    onChange={e => setNewProgramStart(e.target.value)}
                                    className="px-2 text-xs font-bold w-[70px] outline-none border-r border-slate-300 dark:border-slate-700 bg-transparent"
                                />
                                <input 
                                    type="time" 
                                    value={newProgramEnd}
                                    onChange={e => setNewProgramEnd(e.target.value)}
                                    className="px-2 text-xs font-bold w-[70px] outline-none bg-transparent"
                                />
                            </div>
                            <button onClick={addProgram} className="bg-amber-600 text-white px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-amber-700 transition-colors h-9 flex items-center justify-center">
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Grid Area — Scroll Excel-like: header sticky vertical + colunas DATA/DIA sticky horizontal */}
            <div className="flex-1 min-h-0 flex flex-col bg-slate-100 dark:bg-slate-900 relative">
                {isLoading && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 z-[60] overflow-hidden">
                        <div className="h-full bg-amber-200 animate-progress-flow w-1/3"></div>
                    </div>
                )}
                
                <div className="flex-1 min-h-0 p-0 sm:p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-auto custom-scrollbar h-full">
                        <table className="relative border-collapse text-left text-sm min-w-max">
                            <thead className="bg-slate-100 dark:bg-slate-900/80 sticky top-0 z-30">
                                <tr>
                                    <th className="p-3 w-24 min-w-[96px] border-b border-r border-slate-300 dark:border-slate-700 font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs text-center sticky left-0 z-40 bg-slate-100 dark:bg-slate-900">Data</th>
                                    <th className="p-3 w-20 min-w-[80px] border-b border-r border-slate-300 dark:border-slate-700 font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider text-xs text-center sticky left-[96px] z-40 bg-slate-100 dark:bg-slate-900">Dia</th>
                                    {programs.map(p => (
                                        <th key={p} className="px-1.5 py-2 min-w-[85px] max-w-[110px] border-b border-r border-amber-300 dark:border-amber-900/50 font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider text-[10px] text-center bg-amber-100/50 dark:bg-amber-900/20">
                                            {p.replace(/\s*\[\d{2}:\d{2}-\d{2}:\d{2}\]/, '')}
                                            <div className="text-[10px] text-amber-800 dark:text-amber-400/70 font-bold">
                                                {guessTimeForProgram(p).start} - {guessTimeForProgram(p).end}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {days.map(date => {
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                    const isToday = isSameDay(date, new Date());
                                    const isoDate = format(date, 'yyyy-MM-dd');
                                    const feriado = feriadosSet.has(isoDate) ? feriados.find(f => f.data === isoDate) : null;
                                    
                                    const rowHighlightClass = feriado 
                                        ? 'bg-amber-100/50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/40' 
                                        : isWeekend 
                                            ? 'bg-slate-50 dark:bg-slate-800/50' 
                                            : 'hover:bg-blue-50/30 dark:hover:bg-slate-750';

                                    // Classes de background para colunas sticky do tbody (devem herdar cor da linha)
                                    const stickyBg = feriado 
                                        ? 'bg-amber-100/50 dark:bg-amber-900/30' 
                                        : isWeekend 
                                            ? 'bg-slate-50 dark:bg-slate-800/50' 
                                            : 'bg-white dark:bg-slate-800';

                                    return (
                                        <tr key={date.toISOString()} className={`${rowHighlightClass} transition-colors`}>
                                            <td className={`p-2 border-r dark:border-slate-700 text-center font-mono font-bold sticky left-0 z-10 ${stickyBg} ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {format(date, 'dd/MM')}
                                            </td>
                                            <td className={`p-2 border-r dark:border-slate-700 text-center font-medium text-xs uppercase sticky left-[96px] z-10 ${stickyBg} ${feriado ? 'text-amber-800 dark:text-amber-500' : isWeekend ? 'text-red-400' : 'text-slate-500'}`}>
                                                <div className="flex flex-col items-center justify-center min-h-[44px]">
                                                    <span>{format(date, 'EE', { locale: ptBR })}</span>
                                                    {feriado && (
                                                        <span className="text-[8px] font-black uppercase text-amber-600 dark:text-amber-400 leading-tight text-center mt-1 bg-amber-200/50 dark:bg-amber-900/50 px-1 rounded">
                                                            {feriado.descricao}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {programs.map(prog => {
                                                const existingAulas = programAulas.filter(a => isSameDay(new Date(a.data), date) && a.origem === prog);
                                                const aulaTarget = existingAulas[0];

                                                return (
                                                    <td key={`${date.toISOString()}-${prog}`} className="p-0 border-r border-slate-200 dark:border-slate-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors cursor-pointer group relative min-w-[85px] max-w-[110px]">
                                                        <div className="w-full h-full flex flex-col">
                                                            <select
                                                                value={aulaTarget?.instrutorId || ''}
                                                                onChange={(e) => handleCellChange(date, prog, e.target.value)}
                                                                className={`w-full h-full text-[11px] p-2.5 bg-transparent outline-none appearance-none font-semibold cursor-pointer ${aulaTarget ? 'text-amber-900 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-900/40' : 'text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 focus:opacity-100'} transition-all`}
                                                            >
                                                                <option value="">- Livre -</option>
                                                                {instrutores.map(i => (
                                                                    <option key={i.id} value={i.id}>{i.nome}</option>
                                                                ))}
                                                            </select>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleCellChange(date, prog, ''); }}
                                                                className="absolute right-1 top-1 px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-slate-800/90 text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all border border-red-200 shadow-sm text-[8px] font-black uppercase tracking-tighter"
                                                                title="Remover"
                                                            >
                                                                EXCLUIR
                                                            </button>
                                                        </div>
                                                        {existingAulas.length > 1 && (
                                                            <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-[8px] font-black text-center py-0.5">DUPLICADO!</div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
