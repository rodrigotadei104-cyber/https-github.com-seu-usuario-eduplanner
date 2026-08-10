'use client';

import React, { useState, useMemo } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { useSchedule } from '../context/ScheduleContext';
import { Aula, Evento, ClassStatus } from '../types';
import { ptBR } from 'date-fns/locale';


// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
    if (dateStr instanceof Date) return dateStr;
    // parseISO trata a data como local, não UTC
    return parseISO(dateStr);
};

// Helper para formatar horário sem segundos (HH:mm)
const formatTime = (time: string): string => {
    if (!time) return '';
    return time.substring(0, 5); // Retorna apenas HH:mm
};

interface DailyViewProps {
    currentDate: Date;
    aulas: Aula[];
    onEdit: (aula: Aula) => void;
}

// START_HOUR / HOURS agora são dinâmicos (calculados por dia) dentro do componente,
// para a timeline começar no 1º horário e terminar no último — sem vazios de madrugada/noite.

// Unified item type for layout
interface ProcessedItem {
    id: string;
    type: 'aula' | 'evento';
    origem: Aula | Evento;
    startMinutes: number;
    endMinutes: number;
    duration: number;
    colIndex?: number;
    leftPercent?: number;
    widthPercent?: number;
}

export const DailyView: React.FC<DailyViewProps> = ({ currentDate, aulas, onEdit }) => {
    const { isLoading, eventos, instrutores, canManageClasses, deleteEvento, userProfile, cursos, feriadosSet, feriados, datasBloqueadasSet, datasBloqueadas } = useSchedule();
    const [hoveredAulaId, setHoveredAulaId] = useState<string | null>(null);

    // Verificar se o dia atual é feriado
    const dataISO = format(currentDate, 'yyyy-MM-dd');
    const feriadoDoDia = feriadosSet.has(dataISO)
        ? (feriados.find(f => f.data === dataISO) || { descricao: 'Feriado', tipo: 'nacional' })
        : null;

    // Recesso/bloqueio do dia (só informa — não impede aula)
    const bloqueioDoDia = datasBloqueadasSet.has(dataISO)
        ? (datasBloqueadas.find(b => b.data === dataISO) || { motivo: 'Bloqueio' })
        : null;

    // Instrutores de férias no dia — exibidos numa faixa no topo (não ocupam a grade)
    const feriasHoje = useMemo(() => {
        if (!eventos) return [] as string[];
        const nomes = eventos
            .filter(e => {
                const d = e.data instanceof Date ? e.data : new Date(e.data);
                return e.tipo === 'ferias' && e.status !== 'cancelado' &&
                    d.getDate() === currentDate.getDate() &&
                    d.getMonth() === currentDate.getMonth() &&
                    d.getFullYear() === currentDate.getFullYear();
            })
            .map(e => (e.instrutorId && instrutores.find(i => i.id === e.instrutorId)?.nome) || e.nome || 'Instrutor');
        return Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b));
    }, [eventos, currentDate, instrutores]);

    // 1. Calculate layout for BOTH classes and events together
    const processedItems = useMemo(() => {
        const getMinutes = (time: string) => {
            if (!time || typeof time !== 'string' || !time.includes(':')) return 0; // Defensive check
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const items: ProcessedItem[] = [];

        // 1. Add Classes (Aulas)
        aulas.forEach(aula => {
            if (isSameDay(parseLocalDate(aula.data), currentDate)) {
                const start = getMinutes(aula.horarioInicio);
                const end = getMinutes(aula.horarioFim);
                items.push({
                    id: aula.id,
                    type: 'aula',
                    origem: aula,
                    startMinutes: start,
                    endMinutes: end,
                    duration: end - start
                });
            }
        });

        // 2. Add Events (Eventos) - Using Local Date Fix
        if (eventos) {
            eventos.forEach(evento => {
                if (evento.tipo === 'ferias') return; // Férias não ocupam a grade — vão para a faixa no topo
                const eDate = evento.data instanceof Date ? evento.data : new Date(evento.data);
                if (
                    eDate.getDate() === currentDate.getDate() &&
                    eDate.getMonth() === currentDate.getMonth() &&
                    eDate.getFullYear() === currentDate.getFullYear() &&
                    evento.status !== 'cancelado'
                ) {
                    const start = getMinutes(evento.horarioInicio);
                    const end = getMinutes(evento.horarioFim);
                    items.push({
                        id: evento.id,
                        type: 'evento',
                        origem: evento,
                        startMinutes: start,
                        endMinutes: end,
                        duration: end - start
                    });
                }
            });
        }

        // 3. Sort by start time, then duration (desc)
        // 3. Sort by start time (critical for correct visual order)
        items.sort((a, b) => {
            if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
            return b.duration - a.duration;
        });

        // =========================================================================================
        // 4. OPTIMIZED LAYOUT ENGINE: Group Bin Packing
        // DO NOT just assign 1 column per LaneKey. Instead, PACK non-overlapping Groups together.
        // =========================================================================================

        // A. Define Groups
        //    All items with same `LaneKey` MUST share the same visual column (Constraint: Course Continuity)
        const getLaneKey = (item: ProcessedItem) => {
            if (item.type === 'evento') return `_Eventos_${item.id}`; // Events float? Or group? 
            // User wants "Distinct Courses" to share space. 
            // BUT "Continuous Course" (Morning+Afternoon) must be 1 column.
            // So we Group by Course Identifier.
            const aula = item.origem as Aula;
            const identifier = aula.numeroTurma || aula.numeroCurso || 'ZZ';
            return `${identifier}::${aula.curso}`;
        };

        // GroupMap: Key -> List of Items
        const groups: Record<string, ProcessedItem[]> = {};

        // Special case: Eventos.
        // If we want events to share space, we treat each event as a tiny group?
        // Or all events as one group?
        // "Events" usually don't need to be grouped with each other unless they are same track.
        // Let's treat Each Event as its own Group for maximum packing efficiency.
        // For Classes, we MUST group by Course.

        items.forEach(item => {
            const key = getLaneKey(item);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        // B. Prepare Groups for Packing
        interface LayoutGroup {
            key: string;
            items: ProcessedItem[];
            earliestStart: number;
            intervals: { start: number, end: number }[]; // Union of time ranges
        }

        const layoutGroups: LayoutGroup[] = Object.entries(groups).map(([key, groupItems]) => {
            const earliest = Math.min(...groupItems.map(i => i.startMinutes));
            return {
                key,
                items: groupItems,
                earliestStart: earliest,
                intervals: groupItems.map(i => ({ start: i.startMinutes, end: i.endMinutes }))
            };
        });

        // Sort Groups by Start Time (Heuristic for greedy packing)
        layoutGroups.sort((a, b) => a.earliestStart - b.earliestStart);

        // C. Greedy Packing
        // visualColumns[colIndex] = List of Groups in that column
        const visualColumns: LayoutGroup[][] = [];

        layoutGroups.forEach(group => {
            let placed = false;

            // Try to fit in existing columns
            for (let i = 0; i < visualColumns.length; i++) {
                const columnGroups = visualColumns[i];

                // Check Collision with ALL groups in this column
                let hasCollision = false;
                for (const existingGroup of columnGroups) {
                    // Check intersection of ANY interval
                    for (const existingInterval of existingGroup.intervals) {
                        for (const newInterval of group.intervals) {
                            // Standard Interval Intersection: (StartA < EndB) && (EndA > StartB)
                            if (newInterval.start < existingInterval.end && newInterval.end > existingInterval.start) {
                                hasCollision = true;
                                break;
                            }
                        }
                        if (hasCollision) break;
                    }
                    if (hasCollision) break;
                }

                if (!hasCollision) {
                    columnGroups.push(group);
                    placed = true;
                    // Assign items to this column index immediately
                    group.items.forEach(item => {
                        item.colIndex = i;
                    });
                    break;
                }
            }

            // If not placed, create new column
            if (!placed) {
                visualColumns.push([group]);
                group.items.forEach(item => {
                    item.colIndex = visualColumns.length - 1;
                });
            }
        });

        const totalLanes = Math.max(1, visualColumns.length);

        // D. Finalize Coords
        return items.map(item => {
            const colIndex = item.colIndex || 0;
            return {
                ...item,
                colIndex,
                leftPercent: (colIndex / totalLanes) * 100,
                widthPercent: 100 / totalLanes
            };
        });
    }, [aulas, eventos, currentDate]);

    // Janela dinâmica da timeline: do 1º horário ao último do dia (com fallback quando vazio).
    const { START_HOUR, END_HOUR, HOURS } = useMemo(() => {
        if (processedItems.length === 0) {
            const s = 7, e = 19;
            return { START_HOUR: s, END_HOUR: e, HOURS: Array.from({ length: e - s }, (_, i) => i + s) };
        }
        let minStart = Infinity, maxEnd = -Infinity;
        processedItems.forEach(it => {
            if (it.startMinutes < minStart) minStart = it.startMinutes;
            if (it.endMinutes > maxEnd) maxEnd = it.endMinutes;
        });
        const s = Math.max(0, Math.floor(minStart / 60));
        let e = Math.min(24, Math.ceil(maxEnd / 60));
        if (e <= s) e = s + 1;
        return { START_HOUR: s, END_HOUR: e, HOURS: Array.from({ length: e - s }, (_, i) => i + s) };
    }, [processedItems]);

    const [progressMap, setProgressMap] = React.useState<{ [key: string]: any }>({});

    // Optimized: Only fetch progress for VISIBLE items (current day)
    // Generate a stable signature for dependencies to avoid infinite loops
    const processedIdsString = useMemo(() => {
        return processedItems.map(i => i.id).join(',');
    }, [processedItems]);

    // Optimized: Only fetch progress for VISIBLE items (current day)
    React.useEffect(() => {
        const fetchProgress = async () => {
            if (!processedItems.length) return;

            // Robust Tenant ID: Try userProfile first, then first item, finally default
            const firstAulaItem = processedItems.find(i => i.type === 'aula');
            const tenantId = userProfile?.tenantId || (firstAulaItem?.origem as Aula)?.tenantId;

            if (!tenantId) return;

            // Group by CourseID + Cohort (numeroTurma)
            const uniqueCohortKeys = new Set<string>();

            processedItems.forEach(item => {
                if (item.type !== 'aula') return;
                const a = item.origem as Aula;

                let cId = a.cursoId;
                if (!cId && a.curso) {
                    const matched = cursos.find(c => c.nome === a.curso);
                    if (matched) cId = matched.id;
                }

                if (cId) {
                    const cohortId = a.numeroTurma || a.numeroCurso || '';
                    uniqueCohortKeys.add(`${cId}::${cohortId}`);
                }
            });

            if (uniqueCohortKeys.size === 0) return;

            const map: { [key: string]: any } = {};

            await Promise.all(
                Array.from(uniqueCohortKeys).map(async (compositeKey) => {
                    const [courseId, cohortId] = compositeKey.split('::');
                    try {
                        const progress = null; // getCourseProgress not available in current aulaService
                        if (progress) {
                            map[compositeKey] = progress;
                        }
                    } catch (err) {
                        console.error(`Failed loading progress: ${compositeKey}`, err);
                    }
                })
            );

            // Functional update to avoid dependency loop
            setProgressMap(prev => ({ ...prev, ...map }));
        };

        fetchProgress();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processedIdsString, userProfile, cursos]);



    // --- NEW: Cumulative Progress Logic ---
    const { aulas: allAulas, cursos: allCourses } = useSchedule();

    const cumulativeMap = useMemo(() => {
        const map: Record<string, number> = {};
        const courseMap: Record<string, Aula[]> = {};

        // 1. Group by Course
        allAulas.forEach(a => {
            if (!a.cursoId) return;
            // Key by Course + Cohort (to be safe)
            const key = `${a.cursoId}::${a.numeroTurma || a.numeroCurso || 'default'}`;
            if (!courseMap[key]) courseMap[key] = [];
            courseMap[key].push(a);
        });

        // 2. Sort and Calculate
        Object.values(courseMap).forEach(group => {
            // Deduplicate by ID to prevent double counting or overwrite
            const uniqueGroup = Array.from(new Map(group.map(a => [a.id, a])).values());

            // Sort by Date + Time (Lexical sort works for ISO strings YYYY-MM-DD)
            uniqueGroup.sort((a, b) => {
                const timeA = `${a.data}T${a.horarioInicio}`;
                const timeB = `${b.data}T${b.horarioInicio}`;
                return timeA.localeCompare(timeB);
            });

            let runningTotal = 0;
            uniqueGroup.forEach((a, index) => {
                // Calculate Duration
                const [h1, m1] = a.horarioInicio.split(':').map(Number);
                const [h2, m2] = a.horarioFim.split(':').map(Number);
                const dur = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;

                // User Rule: "Deducted progressively, each class effectively given"
                if (a.status === 'concluida' || a.status === 'em-andamento') {
                    runningTotal += dur;
                    map[a.id] = runningTotal;
                } else {
                    map[a.id] = runningTotal;
                }

                // DEBUG LOG
                if (index < 5 || index > uniqueGroup.length - 5) {
                    console.log(`[CumulativeDebug] ID: ${a.id.substring(0, 6)} | Time: ${a.data} ${a.horarioInicio} | Status: ${a.status} | Added: ${dur} | Total: ${runningTotal}`);
                }
            });
        });

        console.log('[CumulativeDebug] Map Size:', Object.keys(map).length);
        return map;
    }, [allAulas]);
    // ---------------------------------------
    // Helper to calculate current time indicator position
    const getCurrentTimePosition = () => {
        const now = new Date();
        const hours = now.getHours() + now.getMinutes() / 60;
        return hours;
    };

    const currentHours = getCurrentTimePosition();
    const showTimeIndicator = isSameDay(new Date(), currentDate) && currentHours >= START_HOUR && currentHours <= END_HOUR;

    // Helper for Status Badge
    const getStatusConfig = (status: ClassStatus) => {
        switch (status) {
            case 'em-andamento':
                return { label: 'Em Andamento', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' };
            case 'concluida':
                return { label: 'Concluída', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
            case 'cancelada':
                return { label: 'Cancelada', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
            case 'agendada':
            default:
                return { label: 'Agendada', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' };
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden print:overflow-visible print:border-0 print:shadow-none print:h-auto">
            <div className="px-6 py-6 border-b border-slate-100 bg-white flex justify-between items-end sticky top-0 z-20 print:static print:bg-white print:border-b-2 print:mb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 capitalize tracking-tight">
                        {format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Visão Operacional Diária</p>
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {processedItems.length} Registros
                </div>
            </div>

            {/* Banner de Feriado */}
            {feriadoDoDia && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 dark:bg-red-900/20 dark:border-red-900/40 flex items-center gap-2">
                    <span className="text-lg">🎉</span>
                    <div>
                        <span className="text-sm font-bold text-red-700 dark:text-red-300">{feriadoDoDia.descricao}</span>
                        <span className="ml-2 text-xs text-red-500 dark:text-red-400 capitalize bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded-full">{feriadoDoDia.tipo}</span>
                    </div>
                    <span className="ml-auto text-xs text-red-500 dark:text-red-400 italic">Aulas não realizadas neste dia</span>
                </div>
            )}

            {/* Banner de Recesso / Bloqueio (só informativo) */}
            {bloqueioDoDia && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-900/40 flex items-center gap-2">
                    <span className="text-lg">🚫</span>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Recesso / Bloqueio: {bloqueioDoDia.motivo}</span>
                    <span className="ml-auto text-xs text-indigo-500 dark:text-indigo-400 italic">Data marcada como bloqueada</span>
                </div>
            )}

            {/* Faixa de Férias (instrutores de férias no dia) */}
            {feriasHoje.length > 0 && (
                <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 dark:bg-rose-900/20 dark:border-rose-900/40 flex items-center gap-2 flex-wrap">
                    <span className="text-base">🌴</span>
                    <span className="text-sm font-bold text-rose-700 dark:text-rose-300">De férias:</span>
                    <span className="text-sm text-rose-600 dark:text-rose-400">{feriasHoje.join(', ')}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto relative custom-scrollbar print:overflow-visible print:h-auto pt-5 pb-5">
                <div className="flex">
                    {/* Timeline Column - Independente dos cards */}
                    <div
                        className="w-16 flex-shrink-0 relative"
                        style={{ minHeight: `${HOURS.length * 5}rem` }}
                    >
                        {HOURS.map((hour) => (
                            <div
                                key={hour}
                                className="absolute w-full text-[10px] font-bold text-slate-300 text-right pr-6 select-none print:text-gray-600 uppercase tracking-tight"
                                style={{ top: `${(hour - START_HOUR) * 5}rem`, transform: 'translateY(-50%)' }}
                            >
                                {hour.toString().padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>

                    {/* Cards Container - Separado da timeline */}
                    <div
                        className="flex-1 relative border-l border-gray-200"
                        style={{ minHeight: `${HOURS.length * 5}rem` }}
                    >
                        {/* Grid Lines - Dentro do container de cards */}
                        {HOURS.map((hour) => (
                            <div
                                key={hour}
                                className="absolute w-full border-t border-slate-100/60 print:border-gray-200 pointer-events-none"
                                style={{ top: `${(hour - START_HOUR) * 5}rem` }}
                            />
                        ))}

                        {/* Current Time Indicator (Hide on print) */}
                        {showTimeIndicator && (
                            <div
                                className="absolute w-full border-t border-blue-500 z-[15] pointer-events-none print:hidden flex items-center"
                                style={{ top: `${(currentHours - START_HOUR) * 5}rem` }}
                            >
                                <div className="absolute left-0 -translate-x-1/2 flex items-center">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                    <div className="ml-2 bg-blue-500 text-[7px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-widest">Agora</div>
                                </div>
                            </div>
                        )}

                        {/* Mixed Items (Classes and Events) */}
                        {processedItems.map((item) => {
                            const startHours = item.startMinutes / 60;
                            const durationHours = item.duration / 60;
                            const top = `${(startHours - START_HOUR) * 5}rem`;
                            const height = `${durationHours * 5}rem`;

                            if (startHours + durationHours < START_HOUR) return null;

                            const leftPercent = item.leftPercent || 0;
                            const widthPercent = item.widthPercent || 100;

                            // ============================================
                            // RENDER: EVENT CARD
                            // ============================================
                            if (item.type === 'evento') {
                                const evento = item.origem as Evento;
                                return (
                                    <div
                                        key={evento.id}
                                        className={`absolute z-20 rounded-lg border-l-4 p-2 text-xs transition-all
                                            ${evento.tipo === 'reuniao' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' :
                                                evento.tipo === 'treinamento' ? 'bg-teal-50 border-teal-500 text-teal-700' :
                                                    evento.tipo === 'feedback' ? 'bg-amber-50 border-amber-500 text-amber-700' :
                                                        evento.tipo === 'ferias' ? 'bg-rose-50 border-rose-500 text-rose-700' :
                                                            'bg-gray-100 border-gray-500 text-gray-700'}
                                        `}
                                        style={{
                                            top: `calc(${top} + 2px)`,
                                            height: `calc(${height} - 4px)`,
                                            // Dynamic positioning
                                            left: `calc(${leftPercent}% + 4px)`,
                                            width: `calc(${widthPercent}% - 8px)`,
                                            opacity: 0.95,
                                            boxShadow: '0 6px 18px -4px rgba(15,23,42,0.28)'
                                        }}
                                        title={`${evento.nome} (${evento.horarioInicio} - ${evento.horarioFim})`}
                                    >
                                        <div className="flex justify-between items-start font-bold">
                                            <span className="line-clamp-1">{evento.nome}</span>
                                            {canManageClasses() && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Excluir evento?')) deleteEvento(evento.id);
                                                    }}
                                                    className="px-1.5 py-0.5 hover:bg-black/10 rounded flex-shrink-0 ml-1 text-[8px] font-black border border-black/10"
                                                >
                                                    EXCLUIR
                                                </button>
                                            )}
                                        </div>
                                        <div className="capitalize opacity-90 line-clamp-1">{evento.tipo}</div>
                                        {/* Hide extra info if too short */}
                                        {durationHours >= 0.7 && (
                                            <>
                                                <div className="flex gap-1 items-center opacity-75 mt-1 truncate">
                                                    <span className="font-bold">HORA:</span> {formatTime(evento.horarioInicio)} - {formatTime(evento.horarioFim)}
                                                </div>
                                                {/* Consolidated Info Row */}
                                                <div className="flex gap-2 items-center opacity-75 mt-0.5 truncate flex-wrap">
                                                    {evento.sala && (
                                                        <div className="flex gap-1 items-center">
                                                            <span className="font-bold">SALA:</span> <span className="truncate">{evento.sala}</span>
                                                        </div>
                                                    )}
                                                    {/* Always show instructor info, default to 'Todos' */}
                                                    <div className="flex gap-1 items-center">
                                                        <span className="font-bold">INSTR:</span> <span className="truncate">{evento.instrutorId ? (instrutores.find(i => i.id === evento.instrutorId)?.nome || 'Todos') : 'Todos'}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            }

                            // ============================================
                            // RENDER: CLASS CARD (AULA) - REDESIGNED
                            // ============================================
                            const aula = item.origem as Aula;
                            // Definition of Compact: Less than 70 minutes (Includes 1h classes)
                            const isCompact = item.duration < 70;
                            const isHovered = hoveredAulaId === aula.id;

                            const isProgram = aula.tipoAula === 'PROGRAMA';
                            const statusConfig = getStatusConfig(aula.status);
                            const statusColor = isProgram ? '#d97706' : (aula.status === 'concluida' ? '#10b981' : (aula.cor || '#3b82f6'));
                            const opacityClass = aula.status === 'cancelada' ? 'opacity-60 grayscale' : 'opacity-100';

                            return (
                                <div
                                    key={aula.id}
                                    onMouseEnter={() => setHoveredAulaId(aula.id)}
                                    onMouseLeave={() => setHoveredAulaId(null)}
                                    onClick={() => onEdit(aula)}
                                    className={`
                                        absolute cursor-pointer transition-all duration-200 z-10 group
                                        rounded-lg border border-gray-100 bg-white
                                        ${opacityClass}
                                        ${isHovered ? 'z-50 ring-2 ring-indigo-500/20' : ''}
                                    `}
                                    style={{
                                        top: `calc(${top} + 1px)`,
                                        height: `calc(${height} - 2px)`,
                                        left: `calc(${leftPercent}% + 2px)`,
                                        width: `calc(${widthPercent}% - 4px)`,
                                        boxShadow: isHovered
                                            ? '0 18px 40px -8px rgba(15,23,42,0.45)'
                                            : '0 6px 18px -4px rgba(15,23,42,0.28)',
                                        transform: isHovered ? 'translateY(-2px)' : 'none',
                                    }}
                                >
                                    {/* Barra Lateral de Status */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
                                        style={{ backgroundColor: statusColor }}
                                    />

                                    {/* Alternância de Layout (Compacto vs Padrão) */}
                                    {isCompact ? (
                                        <div className="h-full flex items-center pl-4 pr-3 gap-4 overflow-hidden">
                                            <div className="flex flex-col flex-shrink-0">
                                                <span className="text-[10px] font-bold text-slate-900 leading-none">
                                                    {formatTime(aula.horarioInicio)}
                                                </span>
                                            </div>

                                            <div className="h-4 w-px bg-slate-100 flex-shrink-0"></div>

                                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                <span className="text-[11px] font-bold text-slate-900 truncate uppercase tracking-tight">
                                                    {isProgram ? 'JOVEM APRENDIZ' : aula.curso}
                                                </span>
                                                {aula.aulaExtra && (
                                                    <span className="bg-amber-500 text-white text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-widest leading-none flex-shrink-0 shadow-sm">
                                                        EXTRA
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex-shrink-0 text-slate-400 hidden sm:block">
                                                {aula.sala && <span className="text-[9px] font-bold text-slate-500">S {aula.sala}</span>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col pl-4 pr-4 py-4 relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="text-[10px] font-bold text-slate-900">
                                                    {formatTime(aula.horarioInicio)} — {formatTime(aula.horarioFim)}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {aula.aulaExtra && (
                                                        <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest leading-none shadow-sm">
                                                            EXTRA
                                                        </span>
                                                    )}
                                                    <div className={`
                                                        px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border
                                                        ${aula.status === 'em-andamento' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                            aula.status === 'concluida' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                'bg-slate-50 text-slate-500 border-slate-200'}
                                                    `}>
                                                        {aula.status}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1">
                                                <h4 className="font-bold text-xs leading-tight text-slate-900 uppercase tracking-tight line-clamp-2">
                                                    {isProgram ? (aula.origem || 'Jovem Aprendiz') : aula.curso}
                                                </h4>
                                                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide truncate">
                                                    {isProgram ? 'Programa' : aula.materia}
                                                </p>
                                            </div>

                                            <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[120px]">
                                                    {aula.instrutor}
                                                </span>
                                                {aula.sala && (
                                                    <span className="text-[9px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        S {aula.sala}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Barra de Progresso (Rodapé do Card) */}
                                    {(() => {
                                        const cId = aula.cursoId || cursos.find(c => c.nome === aula.curso)?.id;
                                        const p = cId ? progressMap[`${cId}::${aula.numeroTurma || aula.numeroCurso || ''}`] : null;
                                        if (p) {
                                            return (
                                                <div className="absolute bottom-0 left-1 right-0 h-1 bg-gray-100">
                                                    <div
                                                        className={`h-full ${p.isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                        style={{ width: `${p.percentage}%` }}
                                                    />
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Detalhes ao passar o Mouse (Popover) */}
                                    {isHovered && (
                                        <div className={`
                                            absolute z-50 w-64 bg-white rounded-lg shadow-2xl border border-gray-200 ring-1 ring-black/5
                                            p-3 cursor-default animate-in fade-in zoom-in-95 duration-150
                                            ${leftPercent > 60 ? 'right-full mr-2' : 'left-full ml-2'}
                                            ${(startHours > 16) ? 'bottom-0' : 'top-0'}
                                        `}>
                                            <div className="flex items-start justify-between mb-2 pb-2 border-b border-gray-100">
                                                <div>
                                                    <span className="text-[10px] font-mono text-gray-500 mb-0.5 flex items-center gap-1.5">
                                                        {formatTime(aula.horarioInicio)} - {formatTime(aula.horarioFim)}
                                                        {aula.aulaExtra && (
                                                            <span className="bg-amber-500 text-white text-[8px] font-black px-1 rounded uppercase tracking-wider leading-none shadow-sm">
                                                                EXTRA
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-900 block leading-tight">
                                                        {isProgram ? 'Jovem Aprendiz' : aula.curso}
                                                    </span>
                                                </div>
                                                <div className={`
                                                    p-1.5 rounded-full font-black text-[10px] uppercase tracking-widest
                                                    ${aula.status === 'em-andamento' ? 'bg-amber-100 text-amber-600' :
                                                        aula.status === 'concluida' ? 'bg-emerald-100 text-emerald-600' :
                                                            'bg-blue-50 text-blue-600'}
                                                `}>
                                                    {statusConfig.label.slice(0, 3)}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Matéria</p>
                                                    <p className="text-xs text-gray-700 leading-snug">{isProgram ? aula.origem : aula.materia}</p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Instrutor</p>
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-700">
                                                            <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                                {aula.instrutor?.charAt(0)}
                                                            </div>
                                                            <span className="truncate">{aula.instrutor?.split(' ')[0]}</span>
                                                        </div>
                                                    </div>
                                                    {aula.sala && (
                                                        <div>
                                                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Sala</p>
                                                            <p className="text-xs text-gray-700">{aula.sala}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Full Course Progress in Popover */}
                                                {(() => {
                                                    const cId = aula.cursoId || cursos.find(c => c.nome === aula.curso)?.id;
                                                    const p = cId ? progressMap[`${cId}::${aula.numeroTurma || aula.numeroCurso || ''}`] : null;
                                                    if (p) {
                                                        return (
                                                            <div className="pt-1">
                                                                <div className="flex justify-between text-[10px] mb-1">
                                                                    <span className="text-gray-500">Progresso do Curso</span>
                                                                    <span className="font-bold text-gray-700">{p.percentage}%</span>
                                                                </div>
                                                                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full ${p.isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                                        style={{ width: `${p.percentage}%` }}
                                                                    />
                                                                </div>
                                                                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                                                                    <span>{p.completedSubjects}/{p.totalSubjects} Matérias</span>
                                                                    <span>{p.completedHours}/{p.totalHours}h</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>

                                            {/* Click Hint */}
                                            <div className="mt-3 text-[9px] text-center text-gray-400 bg-gray-50 py-1 rounded border border-gray-100">
                                                Clique para editar
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] z-30">
                                <div className="flex flex-col items-center gap-2">
                                    <p className="text-xs font-black text-blue-600 uppercase tracking-widest animate-pulse">Carregando Agenda...</p>
                                </div>
                            </div>
                        ) : processedItems.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 font-black text-gray-300 text-2xl">
                                        EP
                                    </div>
                                    <p className="text-gray-500 text-lg font-bold uppercase tracking-widest">Dia Livre</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-black">Não há itens agendados.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>


            </div>
        </div>
    );
};
