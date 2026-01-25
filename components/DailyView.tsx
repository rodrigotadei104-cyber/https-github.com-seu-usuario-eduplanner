import React, { useMemo } from 'react';
import { Aula, ClassStatus, Evento } from '../types';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, User, Clock, CheckCircle, PlayCircle, Calendar, XCircle, Loader2, Trash2 } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';

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

const START_HOUR = 5; // Start timeline at 05:00
const HOURS = Array.from({ length: 24 - START_HOUR }, (_, i) => i + START_HOUR);

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
    const { isLoading, eventos, instrutores, canManageClasses, deleteEvento } = useSchedule();
    // 1. Calculate layout for BOTH classes and events together
    const processedItems = useMemo(() => {
        const getMinutes = (time: string) => {
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
        items.sort((a, b) => {
            if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
            return b.duration - a.duration;
        });

        // 4. Swimlane Layout Strategy (Group by Course)
        // Identify unique columns (Lanes)
        const getLaneKey = (item: ProcessedItem) => {
            if (item.type === 'evento') return ' _Eventos'; // Underscore to sort first or last? Let's sort last or distinct.
            const aula = item.origem as Aula;
            // Key by Course Number (if exists) + Name to ensure uniqueness and fixed order
            // Adding a prefix to ensure Aulas come before/after Events if needed.
            return `${aula.numeroCurso || 'ZZ'} - ${aula.curso}`;
        };

        const uniqueLanes = Array.from(new Set(items.map(getLaneKey))).sort();

        // If we have too many lanes, maybe we should warn or scroll? 
        // For now, simple division. 
        // If we have Events, let's put them in the last column or separate.
        // Let's stick to simple alphanumeric sort of keys. 
        // 'ZZ' fallback ensures courses without numbers go to end, but before Events?
        // Wait, ' _Eventos' starts with space, so it sorts FIRST.
        // Let's decide: Events first or last? User asked for Course Grouping.
        // Let's put Events LAST: 'z_Eventos'
        // But the sort above: `_Eventos` (space) -> First.
        // Let's try putting Events First (Left) or Last (Right).
        // Usually Schedule has "General" on left.

        const totalLanes = uniqueLanes.length > 0 ? uniqueLanes.length : 1;

        return items.map(item => {
            const laneKey = getLaneKey(item);
            const colIndex = uniqueLanes.indexOf(laneKey);

            return {
                ...item,
                colIndex, // Store for reference
                leftPercent: (colIndex / totalLanes) * 100,
                widthPercent: 100 / totalLanes
            };
        });
    }, [aulas, eventos, currentDate]);

    // Helper to calculate current time indicator position
    const getCurrentTimePosition = () => {
        const now = new Date();
        const hours = now.getHours() + now.getMinutes() / 60;
        return hours;
    };

    const currentHours = getCurrentTimePosition();
    const showTimeIndicator = isSameDay(new Date(), currentDate) && currentHours >= START_HOUR;

    // Helper for Status Badge
    const getStatusConfig = (status: ClassStatus) => {
        switch (status) {
            case 'em-andamento':
                return { label: 'Em Andamento', icon: PlayCircle, bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' };
            case 'concluida':
                return { label: 'Concluída', icon: CheckCircle, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
            case 'cancelada':
                return { label: 'Cancelada', icon: XCircle, bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
            case 'agendada':
            default:
                return { label: 'Agendada', icon: Calendar, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' };
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:overflow-visible print:border-0 print:shadow-none print:h-auto">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center sticky top-0 z-20 print:static print:bg-white print:border-b-2 print:mb-4">
                <h2 className="text-lg font-semibold text-gray-800 capitalize">
                    {format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h2>
                <div className="text-sm text-gray-500">
                    {processedItems.length} itens agendados
                </div>
            </div>

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
                                className="absolute w-full text-xs text-gray-400 text-right pr-4 select-none print:text-gray-600"
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
                                className="absolute w-full border-t border-gray-100 print:border-gray-200 pointer-events-none"
                                style={{ top: `${(hour - START_HOUR) * 5}rem` }}
                            />
                        ))}

                        {/* Current Time Indicator (Hide on print) */}
                        {showTimeIndicator && (
                            <div
                                className="absolute w-full border-t-2 border-red-500/70 z-[15] pointer-events-none print:hidden"
                                style={{ top: `${(currentHours - START_HOUR) * 5}rem` }}
                            >
                                <div className="w-3 h-3 bg-red-500 rounded-full absolute -left-1.5 -translate-y-1/2 shadow-md"></div>
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
                                        className={`absolute z-20 rounded border-l-4 p-2 shadow-sm text-xs transition-all
                                            ${evento.tipo === 'reuniao' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' :
                                                evento.tipo === 'treinamento' ? 'bg-teal-50 border-teal-500 text-teal-700' :
                                                    evento.tipo === 'feedback' ? 'bg-amber-50 border-amber-500 text-amber-700' :
                                                        'bg-gray-100 border-gray-500 text-gray-700'}
                                        `}
                                        style={{
                                            top: `calc(${top} + 2px)`,
                                            height: `calc(${height} - 4px)`,
                                            // Dynamic positioning
                                            left: `calc(${leftPercent}% + 4px)`,
                                            width: `calc(${widthPercent}% - 8px)`,
                                            opacity: 0.95
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
                                                    className="p-0.5 hover:bg-black/10 rounded flex-shrink-0 ml-1"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="capitalize opacity-90 line-clamp-1">{evento.tipo}</div>
                                        {/* Hide extra info if too short */}
                                        {durationHours >= 0.7 && (
                                            <>
                                                <div className="flex gap-1 items-center opacity-75 mt-1 truncate">
                                                    <Clock size={10} className="flex-shrink-0" /> {formatTime(evento.horarioInicio)} - {formatTime(evento.horarioFim)}
                                                </div>
                                                {/* Consolidated Info Row */}
                                                <div className="flex gap-2 items-center opacity-75 mt-0.5 truncate flex-wrap">
                                                    {evento.sala && (
                                                        <div className="flex gap-1 items-center">
                                                            <MapPin size={10} className="flex-shrink-0" /> <span className="truncate">{evento.sala}</span>
                                                        </div>
                                                    )}
                                                    {/* Always show instructor info, default to 'Todos' */}
                                                    <div className="flex gap-1 items-center">
                                                        <User size={10} className="flex-shrink-0" /> <span className="truncate">{evento.instrutorId ? (instrutores.find(i => i.id === evento.instrutorId)?.nome || 'Todos') : 'Todos'}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            }

                            // ============================================
                            // RENDER: CLASS CARD (AULA)
                            // ============================================
                            const aula = item.origem as Aula;
                            const isShort = item.duration <= 45;
                            const isVeryShort = item.duration <= 30;

                            const statusConfig = getStatusConfig(aula.status);
                            const StatusIcon = statusConfig.icon;

                            return (
                                <div
                                    key={aula.id}
                                    onClick={() => onEdit(aula)}
                                    className={`
                                    absolute cursor-pointer hover:shadow-xl hover:z-20 transition-all duration-200 z-10 group
                                    overflow-hidden print:shadow-none rounded-lg shadow-sm
                                    ${aula.status === 'cancelada' ? 'opacity-80 grayscale-[0.3]' : ''}
                                `}
                                    style={{
                                        // Adiciona margem interna para evitar overlap
                                        top: `calc(${top} + 2px)`,
                                        height: `calc(${height} - 4px)`,
                                        // Espaçamento horizontal entre cards side-by-side
                                        left: `calc(${leftPercent}% + 4px)`,
                                        width: `calc(${widthPercent}% - 8px)`,
                                        backgroundColor: aula.status === 'concluida' ? '#f0fdf4' : (aula.cor ? `${aula.cor}15` : '#f8f9fa'), // 15 = ~8% opacity
                                        borderLeftColor: aula.cor,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {/* Borda colorida isolada dentro do card */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                                        style={{ backgroundColor: aula.cor }}
                                    />
                                    {/* --- Layout for VERY SHORT events (<= 30 min) --- */}
                                    {isVeryShort ? (
                                        <div className="h-full px-2 flex items-center gap-2 text-xs">
                                            <span className="font-mono font-bold text-gray-600 flex-shrink-0">{formatTime(aula.horarioInicio)}</span>
                                            <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                            <span className="font-semibold text-gray-800 truncate flex-1">
                                                {aula.numeroCurso ? `${aula.numeroCurso} - ` : ''}{aula.materia}
                                            </span>
                                            {/* Mini Status Icon for very short events */}
                                            <div className={`p-0.5 rounded-full ${statusConfig.bg} ${statusConfig.text}`} title={statusConfig.label}>
                                                <StatusIcon size={12} />
                                            </div>
                                        </div>
                                    ) : (
                                        /* --- Layout for NORMAL events --- */
                                        <div className="h-full flex flex-col p-2 sm:p-3">

                                            {/* Header: Course Name & Status Badge */}
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500 truncate dark:text-gray-400" style={{ color: aula.cor }}>
                                                    {aula.numeroCurso ? `${aula.numeroCurso} - ` : ''}{aula.curso}
                                                </span>

                                                {/* Status Badge */}
                                                <div className={`
                                flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shadow-sm whitespace-nowrap
                                ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}
                            `}>
                                                    <StatusIcon size={10} />
                                                    <span>{statusConfig.label}</span>
                                                </div>
                                            </div>

                                            {/* Body: Subject Name */}
                                            <div className={`font-bold text-gray-800 leading-tight mb-auto ${isShort ? 'text-xs line-clamp-1' : 'text-sm line-clamp-2'}`}>
                                                {aula.materia}
                                            </div>

                                            {/* Footer: Details (Time, Room, Instructor) */}
                                            {!isShort && (
                                                <div className="mt-2 pt-2 border-t border-gray-100/50 space-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Horário">
                                                        <Clock size={12} className="text-gray-400" />
                                                        <span>{formatTime(aula.horarioInicio)} - {formatTime(aula.horarioFim)}</span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Carga horária efetiva">
                                                        <span className="font-medium text-blue-600 dark:text-blue-400">
                                                            Carga contabilizada: {(item.duration / (Number(aula.minutosPorHora) || 60)).toFixed(1).replace('.0', '')}h
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs text-gray-600">
                                                        <div className="flex items-center gap-1.5 truncate" title="Instrutor">
                                                            <User size={12} className="text-gray-400" />
                                                            <span>{aula.instrutor}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 truncate" title="Sala">
                                                            <MapPin size={12} className="text-gray-400" />
                                                            <span>Sala: {aula.sala || 'N/D'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Footer for Short events (Compact) */}
                                            {isShort && !isVeryShort && (
                                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600 truncate">
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={10} /> {formatTime(aula.horarioInicio)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MapPin size={10} /> Sala: {aula.sala}
                                                    </span>
                                                </div>
                                            )}

                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] z-30">
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                    <p className="text-sm font-medium text-gray-500">Carregando agenda...</p>
                                </div>
                            </div>
                        ) : processedItems.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                        <Calendar className="w-8 h-8 text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 text-lg font-medium">Dia livre!</p>
                                    <p className="text-gray-400 text-sm">Não há itens agendados para esta data.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>


            </div>
        </div>
    );
};