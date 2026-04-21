import React from 'react';
import { Aula } from '../types';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { Loader2, AlertCircle } from 'lucide-react';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};

interface MonthlyViewProps {
  currentDate: Date;
  aulas: Aula[];
  onSelectDate: (date: Date) => void;
  onEditAula: (aula: Aula) => void;
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({ currentDate, aulas, onSelectDate, onEditAula }) => {
  const { isLoading, filters, eventos, instrutores, feriadosSet, feriados } = useSchedule();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Helper: buscar feriado de um dia específico
  const getFeriado = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd');
    if (!feriadosSet.has(iso)) return null;
    return feriados.find(f => f.data === iso) || { data: iso, descricao: 'Feriado', tipo: 'nacional' };
  };

  // Empty State Logic
  const hasAulas = aulas.length > 0;
  const isCancelledFilter = filters.status === 'cancelada';

  if (!hasAulas && isCancelledFilter && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex items-center justify-center flex-col p-8">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Sem cancelamentos</h3>
        <p className="text-gray-500 text-center max-w-sm">
          Nenhuma aula cancelada encontrada neste período.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-gray-500">Buscando aulas...</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {weekDays.map((day) => (
          <div key={day} className="py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-7 auto-rows-min min-h-0">
          {days.map((day, dayIdx) => {
            const dayAulas = aulas.filter(a => isSameDay(parseLocalDate(a.data), day));
            // Sort by time
            dayAulas.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

            const dayEventos = eventos ? eventos.filter(e => {
              const eDate = e.data instanceof Date ? e.data : new Date(e.data);
              return (
                eDate.getDate() === day.getDate() &&
                eDate.getMonth() === day.getMonth() &&
                eDate.getFullYear() === day.getFullYear() &&
                e.status !== 'cancelado'
              );
            }) : [];
            dayEventos.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

            const isCurrentMonth = isSameMonth(day, monthStart);
            const isDayToday = isToday(day);
            const feriado = getFeriado(day);

            return (
              <div
                key={day.toString()}
                onClick={() => onSelectDate(day)}
                title={feriado ? `🎉 ${feriado.descricao}` : undefined}
                className={`
                min-h-[120px] p-2 border-b border-r relative group cursor-pointer transition-colors
                ${feriado ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' :
                    !isCurrentMonth ? 'bg-gray-50/50 text-gray-400 border-gray-100' : 'bg-white border-gray-100'}
                ${isDayToday && !feriado ? 'bg-blue-50/30' : ''}
                ${!feriado ? 'hover:bg-gray-50' : 'hover:bg-red-100/60'}
              `}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`
                  text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                  ${isDayToday ? 'bg-blue-600 text-white' : feriado ? 'text-red-700 font-bold' : 'text-gray-700'}
                `}>
                    {format(day, 'd')}
                  </span>
                  {dayAulas.length > 0 && (
                    <span className="text-xs text-gray-400 font-medium">{dayAulas.length}</span>
                  )}
                </div>

                {/* Badge de feriado */}
                {feriado && (
                  <div className="mb-1">
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full leading-tight">
                      🎉 {feriado.descricao.length > 18 ? feriado.descricao.substring(0, 18) + '…' : feriado.descricao}
                    </span>
                  </div>
                )}
                <div className="space-y-1 overflow-y-auto max-h-[100px] custom-scrollbar">
                  {/* Events first */}
                  {dayEventos.map((evento) => (
                    <div
                      key={evento.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 mb-0.5
                            ${evento.tipo === 'reuniao' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' :
                          evento.tipo === 'treinamento' ? 'bg-teal-50 border-teal-500 text-teal-700' :
                            'bg-gray-100 border-gray-500 text-gray-700'}
                        `}
                      title={`${evento.horarioInicio} - ${evento.nome} (${evento.tipo})${evento.instrutorId ? ` - Instrutor: ${instrutores.find(i => i.id === evento.instrutorId)?.nome}` : ''}`}
                    >
                      <span className="font-bold mr-1">{evento.horarioInicio}</span>
                      {evento.nome}
                    </div>
                  ))}

                  {dayAulas.slice(0, 4 - Math.min(dayEventos.length, 2)).map((aula) => (
                    <div
                      key={aula.id}
                      onClick={(e) => { e.stopPropagation(); onEditAula(aula); }}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 hover:opacity-80 transition"
                      style={{
                        backgroundColor: `${aula.cor}15`,
                        color: '#334155', // slate-700
                        borderLeftColor: aula.cor
                      }}
                      title={`${aula.horarioInicio} - ${aula.instrutor || 'Não atribuído'} - ${aula.materia}`}
                    >
                      <div className="flex items-center gap-1 font-semibold leading-tight">
                        <span>{aula.horarioInicio}</span>
                        <span className="truncate">{aula.instrutor || 'Não atribuído'}</span>
                      </div>
                    </div>
                  ))}
                  {dayAulas.length > 4 && (
                    <div className="text-[10px] text-gray-400 text-center pt-1">
                      + {dayAulas.length - 4} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div >
  );
};
