import React, { useMemo } from 'react';
import { Aula, ClassStatus } from '../types';
import { format, isSameDay, parse, differenceInMinutes, parseISO } from 'date-fns';
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

interface ProcessedClass extends Aula {
    startMinutes: number;
    endMinutes: number;
    duration: number;
    colIndex?: number;
    leftPercent?: number;
    widthPercent?: number;
}

export const DailyView: React.FC<DailyViewProps> = ({ currentDate, aulas, onEdit }) => {
    const { isLoading, eventos, instrutores, canManageClasses, deleteEvento } = useSchedule();
    // 1. Calculate layout for overlapping events
    const processedClasses = useMemo(() => {
        const getMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        // Filter for today and sort by start time, then duration (desc)
        const dayClasses: ProcessedClass[] = aulas
            .filter((a) => isSameDay(parseLocalDate(a.data), currentDate))
            .map(a => ({
                ...a,
                startMinutes: getMinutes(a.horarioInicio),
                endMinutes: getMinutes(a.horarioFim),
                duration: getMinutes(a.horarioFim) - getMinutes(a.horarioInicio)
            }))
            .sort((a, b) => {
                if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
                return b.duration - a.duration;
            });

        // Cluster detection for overlaps
        const clusters: ProcessedClass[][] = [];
        let currentCluster: ProcessedClass[] = [];
        let clusterEnd = -1;

        dayClasses.forEach(event => {
            if (currentCluster.length === 0) {
                currentCluster.push(event);
                clusterEnd = event.endMinutes;
            } else {
                // Overlap check: if event starts before cluster ends
                if (event.startMinutes < clusterEnd) {
                    currentCluster.push(event);
                    clusterEnd = Math.max(clusterEnd, event.endMinutes);
                } else {
                    clusters.push(currentCluster);
                    currentCluster = [event];
                    clusterEnd = event.endMinutes;
                }
            }
        });
        if (currentCluster.length > 0) clusters.push(currentCluster);

        // Assign columns within clusters
        const finalEvents: ProcessedClass[] = [];

        clusters.forEach(cluster => {
            const columns: ProcessedClass[][] = [];
            cluster.forEach(event => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const lastInCol = columns[i][columns[i].length - 1];
                    if (event.startMinutes >= lastInCol.endMinutes) {
                        columns[i].push(event);
                        event.colIndex = i;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    columns.push([event]);
                    event.colIndex = columns.length - 1;
                }
            });

            const totalCols = columns.length;
            cluster.forEach(event => {
                const colIndex = event.colIndex || 0;
                finalEvents.push({
                    ...event,
                    leftPercent: (colIndex / totalCols) * 100,
                    widthPercent: 100 / totalCols
                });
            });
        });

        return finalEvents;
    }, [aulas, currentDate]);

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
                    {processedClasses.length} aulas agendadas
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

                        {/* Events Overlay */}
                        {eventos && eventos.filter(evento => {
                            const eDateStr = evento.data instanceof Date ? evento.data.toISOString().split('T')[0] : String(evento.data).split('T')[0];
                            const cDateStr = currentDate.toISOString().split('T')[0];
                            return eDateStr === cDateStr && evento.status !== 'cancelado';
                        }).map(evento => {
                            const [startH, startM] = evento.horarioInicio.split(':').map(Number);
                            const [endH, endM] = evento.horarioFim.split(':').map(Number);

                            const startTotalHours = startH + startM / 60;
                            const endTotalHours = endH + endM / 60;

                            if (endTotalHours < START_HOUR) return null;

                            const top = (startTotalHours - START_HOUR) * 5; // 5rem per hour
                            const height = (endTotalHours - startTotalHours) * 5;

                            return (
                                <div
                                    key={evento.id}
                                    className={`absolute left-0 right-0 z-20 mx-12 rounded border-l-4 p-2 shadow-sm text-xs
                                        ${evento.tipo === 'reuniao' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' :
                                            evento.tipo === 'treinamento' ? 'bg-teal-50 border-teal-500 text-teal-700' :
                                                evento.tipo === 'feedback' ? 'bg-amber-50 border-amber-500 text-amber-700' :
                                                    'bg-gray-100 border-gray-500 text-gray-700'}
                                    `}
                                    style={{
                                        top: `${top}rem`,
                                        height: `${height}rem`,
                                        opacity: 0.95
                                    }}
                                    title={`${evento.nome} (${evento.horarioInicio} - ${evento.horarioFim})`}
                                >
                                    <div className="flex justify-between items-start font-bold">
                                        <span>{evento.nome}</span>
                                        {canManageClasses() && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Excluir evento?')) deleteEvento(evento.id);
                                                }}
                                                className="p-0.5 hover:bg-black/10 rounded"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="capitalize opacity-90">{evento.tipo}</div>
                                    <div className="flex gap-1 items-center opacity-75 mt-1">
                                        <Clock size={10} /> {formatTime(evento.horarioInicio)} - {formatTime(evento.horarioFim)}
                                    </div>
                                    {/* Consolidated Info Row */}
                                    <div className="flex gap-2 items-center opacity-75 mt-0.5">
                                        {evento.sala && (
                                            <div className="flex gap-1 items-center">
                                                <MapPin size={10} /> <span>{evento.sala}</span>
                                            </div>
                                        )}
                                        {/* Always show instructor info, default to 'Todos' */}
                                        <div className="flex gap-1 items-center">
                                            <User size={10} /> <span>{evento.instrutorId ? (instrutores.find(i => i.id === evento.instrutorId)?.nome || 'Todos') : 'Todos'}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Classes */}
                        {processedClasses.map((aula) => {
                            const startHours = aula.startMinutes / 60;
                            const durationHours = aula.duration / 60;

                            const top = `${(startHours - START_HOUR) * 5}rem`;
                            const height = `${durationHours * 5}rem`;

                            if (startHours + durationHours < START_HOUR) return null;

                            const isShort = aula.duration <= 45;
                            const isVeryShort = aula.duration <= 30;
                            const leftPercent = aula.leftPercent || 0;
                            const widthPercent = aula.widthPercent || 100;

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
                                        backgroundColor: aula.status === 'concluida' ? '#f0fdf4' : 'white',
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
                                            <span className="font-mono font-bold text-gray-600">{formatTime(aula.horarioInicio)}</span>
                                            <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                            <span className="font-semibold text-gray-800 truncate flex-1">{aula.materia}</span>
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
                                                    {aula.curso}
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
                                                            Carga contabilizada: {(aula.duration / (Number(aula.minutosPorHora) || 60)).toFixed(1).replace('.0', '')}h
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
                        ) : processedClasses.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                        <Calendar className="w-8 h-8 text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 text-lg font-medium">Dia livre!</p>
                                    <p className="text-gray-400 text-sm">Não há aulas agendadas para esta data.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>


            </div>
        </div>
    );
};