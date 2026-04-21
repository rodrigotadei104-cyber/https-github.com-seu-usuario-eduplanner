import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay, parseISO } from 'date-fns';
import { useSchedule } from '../context/ScheduleContext';
import { Aula } from '../types';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};

// Formatação simples de horário (08:00 para 08h)
const formatHorasEnxuto = (horario: string): string => {
  return `${horario.split(':')[0]}h`;
};

// Paleta de Cores Escuras e Intensas para garantir contraste perfeito com texto Branco
const DARK_COLORS = [
  '#059669', // Emerald 600 (Dark Green)
  '#7C3AED', // Violet 600 (Dark Purple)
  '#DC2626', // Red 600 (Dark Red)
  '#D97706', // Amber 600 (Dark Orange)
  '#2563EB', // Blue 600 (Dark Blue)
  '#0891b2', // Cyan 600
  '#4F46E5', // Indigo 600
  '#be185d', // Pink 700
];

const getInstructorColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return DARK_COLORS[Math.abs(hash) % DARK_COLORS.length];
};

interface MonthlyViewProps {
  currentDate: Date;
  aulas: Aula[];
  onSelectDate: (date: Date) => void;
  onEditAula: (aula: Aula) => void;
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({ currentDate, aulas, onSelectDate, onEditAula }) => {
  const { isLoading, filters, eventos, instrutores, feriadosSet, feriados, cursos } = useSchedule();
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
        <div className="text-[10px] bg-red-50 text-red-600 px-3 py-1 rounded font-black uppercase tracking-widest border border-red-100 mb-4">
            Atenção
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-2 uppercase tracking-tight">Sem cancelamentos</h3>
        <p className="text-[11px] text-gray-400 text-center max-w-sm uppercase font-bold">
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
            <p className="text-xs font-black text-blue-600 uppercase tracking-widest animate-pulse">Buscando Aulas...</p>
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
                title={feriado ? `FERIADO: ${feriado.descricao}` : undefined}
                className={`
                min-h-[160px] border-b border-r relative group cursor-pointer transition-colors flex flex-col
                ${feriado ? 'bg-[#fff8e1] border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40' :
                    !isCurrentMonth ? 'bg-gray-50/50 text-gray-400 border-gray-100' : 'bg-white border-gray-100'}
                ${isDayToday && !feriado ? 'bg-blue-50/30' : ''}
                ${!feriado ? 'hover:bg-gray-50' : 'hover:bg-amber-100/50'}
              `}
              >
                <div className="flex justify-between items-start p-2 pb-1 shrink-0">
                  <span className={`
                  text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                  ${isDayToday ? 'bg-blue-600 text-white' : feriado ? 'text-amber-800 font-bold dark:text-amber-500' : 'text-gray-700'}
                `}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Área de conteúdo do dia */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5 pb-1 flex flex-col gap-1">
                  
                  {/* Tratamento Isolado para Feriado */}
                  {feriado && (
                    <div className="flex-1 flex flex-col items-center justify-center pt-2">
                       <span className="text-[10px] font-black uppercase text-amber-900/60 dark:text-amber-500/80 mb-1 tracking-widest">[ FERIADO ]</span>
                       <span className="text-xs text-amber-900 dark:text-amber-500 font-semibold text-center max-w-[90%] leading-tight">
                         {feriado.descricao}
                       </span>
                    </div>
                  )}

                  {!feriado && dayEventos.map((evento) => (
                    <div
                      key={evento.id}
                      className={`text-[9px] px-2 py-1 rounded truncate shadow-sm font-semibold text-white
                            ${evento.tipo === 'reuniao' ? 'bg-indigo-600' :
                          evento.tipo === 'treinamento' ? 'bg-teal-600' :
                            'bg-gray-600'}
                        `}
                      title={`${evento.horarioInicio} - ${evento.nome} (${evento.tipo})${evento.instrutorId ? ` - Instrutor: ${instrutores.find(i => i.id === evento.instrutorId)?.nome}` : ''}`}
                    >
                      <span>{evento.horarioInicio} • </span>
                      {evento.nome}
                    </div>
                  ))}

                  {(() => {
                    const groupsMap = new Map();
                    dayAulas.forEach(aula => {
                      const groupKey = `${aula.instrutorId || aula.instrutor}-${aula.cursoId}-${aula.numeroTurma}-${aula.tipoAula}-${aula.cor}`;
                      if (!groupsMap.has(groupKey)) {
                        groupsMap.set(groupKey, []);
                      }
                      groupsMap.get(groupKey).push(aula);
                    });

                    const consolidatedAulas: Aula[] = [];
                    groupsMap.forEach((aulasGroup) => {
                      aulasGroup.sort((a: Aula, b: Aula) => a.horarioInicio.localeCompare(b.horarioInicio));
                      
                      let mergedBlock = { ...aulasGroup[0] };
                      for (let i = 1; i < aulasGroup.length; i++) {
                        const nextAula = aulasGroup[i];
                        if (mergedBlock.horarioFim >= nextAula.horarioInicio) {
                          if (nextAula.horarioFim > mergedBlock.horarioFim) {
                             mergedBlock.horarioFim = nextAula.horarioFim;
                          }
                        } else {
                          consolidatedAulas.push(mergedBlock);
                          mergedBlock = { ...nextAula };
                        }
                      }
                      consolidatedAulas.push(mergedBlock);
                    });

                    consolidatedAulas.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

                    return consolidatedAulas.map((aula) => {
                      const isProgram = aula.tipoAula === 'PROGRAMA';
                      const instrutorNome = isProgram ? `Menor: ${aula.origem}` : aula.instrutor || 'Sem Instrutor';
                      const baseColor = isProgram ? '#c2410c' : getInstructorColor(instrutorNome);
                      const turnoLabel = `${formatHorasEnxuto(aula.horarioInicio)} às ${formatHorasEnxuto(aula.horarioFim)}`;
                      const line1 = `${instrutorNome.split(' ')[0]} • ${turnoLabel}`;
                      const cursoNome = cursos.find(c => c.id === aula.cursoId)?.nome || aula.curso || '';
                      const turmaLabel = `Turma #${aula.numeroTurma || aula.id.substring(0,5)}`;

                      return (
                        <div
                          key={aula.id + aula.horarioInicio}
                          onClick={(e) => { e.stopPropagation(); onEditAula(aula); }}
                          className="text-[9px] px-2 py-1.5 rounded shadow-sm hover:opacity-90 transition text-white flex flex-col gap-[1px] leading-tight cursor-pointer mb-1"
                          style={{ backgroundColor: baseColor }}
                          title={`${aula.horarioInicio} às ${aula.horarioFim}\n${instrutorNome}\nTurma #${aula.numeroTurma || '-'}\n${cursoNome}`}
                        >
                           <span className="font-bold truncate">{line1}</span>
                           {cursoNome && <span className="truncate opacity-[0.85] text-[8px] tracking-wide">{cursoNome}</span>}
                           <span className="truncate opacity-70 tracking-wider text-[8px]">{turmaLabel}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div >
  );
};
