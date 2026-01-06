import React, { useState, useMemo } from 'react';
import { Stats, Aula } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Clock, BookOpen, AlertCircle, CheckCircle, Calendar, Filter, ArrowRight } from 'lucide-react';
import { format, isSameMonth, eachMonthOfInterval, startOfYear, endOfYear, getMonth, isSameDay, isSameYear, isWithinInterval, parse, differenceInMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};
import { useSchedule } from '../context/ScheduleContext';

interface DashboardProps {
  stats: Stats;
  allAulas: Aula[];
  currentDate: Date;
  onNavigateToMonth: (date: Date) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentDate, onNavigateToMonth }) => {
  const { setViewMode, setFilters, filters, filteredAulas } = useSchedule();
  const [instructorViewMode, setInstructorViewMode] = useState<'daily' | 'monthly' | 'annual'>('monthly');

  const start = startOfYear(currentDate);
  const end = endOfYear(currentDate);
  const months = eachMonthOfInterval({ start, end });
  const currentYearLabel = format(currentDate, 'yyyy');

  // --- 1. Calculate Stats Specific to the Viewed Year ---
  // We compute this locally to ensure the cards match the year being viewed (currentDate),
  // while still respecting global filters (search/instructor) from 'filteredAulas'.
  const yearStats = useMemo(() => {
    const yearAulas = filteredAulas.filter(a =>
      isWithinInterval(parseLocalDate(a.data), { start, end })
    );

    let totalMinutes = 0;
    const instructors = new Set<string>();
    const statusCounts = {
      agendada: 0,
      'em-andamento': 0,
      concluida: 0,
      cancelada: 0
    };

    let activeClassesCount = 0;

    yearAulas.forEach(aula => {
      // Count status safely for breakdown chart
      if (statusCounts[aula.status as keyof typeof statusCounts] !== undefined) {
        statusCounts[aula.status as keyof typeof statusCounts]++;
      }

      // STRICT METRICS: Cancelled classes do NOT contribute to Headline Stats
      if (aula.status !== 'cancelada') {
        activeClassesCount++;
        instructors.add(aula.instrutor);

        // Calculate duration - horários vêm como HH:mm ou HH:mm:ss
        const startTime = aula.horarioInicio?.substring(0, 5) || '00:00';
        const endTime = aula.horarioFim?.substring(0, 5) || '00:00';
        const s = parse(startTime, 'HH:mm', new Date());
        const e = parse(endTime, 'HH:mm', new Date());
        const diff = differenceInMinutes(e, s);
        if (!isNaN(diff) && diff > 0) totalMinutes += diff;
      }
    });

    return {
      totalAulas: activeClassesCount, // Headline uses only active classes
      totalHoras: Math.round(totalMinutes / 60),
      instrutoresAtivos: instructors.size,
      aulasPorStatus: statusCounts // Breakdown keeps all
    };
  }, [filteredAulas, start, end]);


  // --- 2. Chart Data (Annual) ---
  // Uses 'filteredAulas' to ensure chart updates when user searches/filters in sidebar
  const chartData = months.map(month => {
    const count = filteredAulas.filter(a =>
      isSameMonth(parseLocalDate(a.data), month) && a.status !== 'cancelada'
    ).length;
    return {
      name: format(month, 'MMM', { locale: ptBR }),
      fullName: format(month, 'MMMM', { locale: ptBR }),
      aulas: count,
      date: month
    };
  });

  // --- 3. Instructor Stats Logic ---
  const instructorStats = useMemo(() => {
    // Filter by Status (Agendada only) and Time Period
    const filtered = filteredAulas.filter(a => {
      if (a.status !== 'agendada') return false;

      const aulaDate = parseLocalDate(a.data);

      if (instructorViewMode === 'daily') {
        return isSameDay(aulaDate, currentDate);
      }
      if (instructorViewMode === 'monthly') {
        return isSameMonth(aulaDate, currentDate);
      }
      if (instructorViewMode === 'annual') {
        return isSameYear(aulaDate, currentDate);
      }
      return false;
    });

    // Group by Instructor
    const counts: Record<string, number> = {};
    filtered.forEach(a => {
      counts[a.instrutor] = (counts[a.instrutor] || 0) + 1;
    });

    // Convert to Array and Sort
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [filteredAulas, currentDate, instructorViewMode]);

  const maxInstructorCount = Math.max(...instructorStats.map(i => i.count), 0);

  const handleNavigateToCancelled = () => {
    setFilters({ ...filters, status: 'cancelada' });
    setViewMode('daily');
  };

  const StatCard = ({ title, value, icon: Icon, color, subtext }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-start justify-between hover:shadow-md transition-shadow dark:bg-slate-800 dark:border-slate-700">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1 dark:text-gray-400">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
        {subtext && <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-1 pb-10">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total de Aulas"
          value={yearStats.totalAulas}
          icon={BookOpen}
          color="bg-blue-500"
          subtext={`Ativas em ${currentYearLabel}`}
        />
        <StatCard
          title="Horas Lecionadas"
          value={`${yearStats.totalHoras}h`}
          icon={Clock}
          color="bg-purple-500"
          subtext="Carga horária total do ano"
        />
        <StatCard
          title="Instrutores Ativos"
          value={yearStats.instrutoresAtivos}
          icon={Users}
          color="bg-indigo-500"
          subtext={`Neste ano de ${currentYearLabel}`}
        />
        <StatCard
          title="Conclusão"
          value={`${yearStats.totalAulas > 0 ? Math.round((yearStats.aulasPorStatus.concluida / yearStats.totalAulas) * 100) : 0}%`}
          icon={CheckCircle}
          color="bg-teal-500"
          subtext={`${yearStats.aulasPorStatus.concluida} concluídas em ${currentYearLabel}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-800 mb-6 dark:text-white">Distribuição Anual de Aulas ({currentYearLabel})</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:opacity-10" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="aulas" radius={[4, 4, 0, 0]} onClick={(data: any) => data?.date && onNavigateToMonth(data.date)}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={isSameMonth(entry.date, currentDate) ? '#3b82f6' : '#cbd5e1'}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-800 mb-6 dark:text-white">Status das Aulas ({currentYearLabel})</h3>
          <div className="space-y-4">
            {[
              { label: 'Agendada', val: yearStats.aulasPorStatus.agendada, color: 'bg-blue-500' },
              { label: 'Em Andamento', val: yearStats.aulasPorStatus['em-andamento'], color: 'bg-yellow-500' },
              { label: 'Concluída', val: yearStats.aulasPorStatus.concluida, color: 'bg-teal-500' },
              { label: 'Cancelada', val: yearStats.aulasPorStatus.cancelada, color: 'bg-red-500' },
            ].map((item) => {
              // Percentage base includes cancelled for Distribution view clarity
              const totalForDistribution =
                yearStats.aulasPorStatus.agendada +
                yearStats.aulasPorStatus['em-andamento'] +
                yearStats.aulasPorStatus.concluida +
                yearStats.aulasPorStatus.cancelada;

              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{item.val}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 dark:bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${item.color}`}
                      style={{ width: `${totalForDistribution > 0 ? (item.val / totalForDistribution) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700">
            <button
              onClick={handleNavigateToCancelled}
              className="w-full text-left flex items-center gap-3 p-3 bg-red-50 rounded-lg text-red-700 text-sm dark:bg-red-900/20 dark:text-red-300 cursor-pointer hover:bg-red-100 hover:shadow-sm transition-all active:scale-95 group"
              title="Clique para filtrar apenas aulas canceladas"
            >
              <AlertCircle size={20} className="flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold block">Atenção</span>
                {yearStats.aulasPorStatus.cancelada} aulas canceladas em {currentYearLabel}.
              </div>
              <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Instrutor Stats */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Aulas Agendadas por Instrutor</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Considerando apenas aulas confirmadas no período</p>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-lg dark:bg-slate-700 self-start sm:self-auto">
            <button
              onClick={() => setInstructorViewMode('daily')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${instructorViewMode === 'daily'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
            >
              Dia
            </button>
            <button
              onClick={() => setInstructorViewMode('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${instructorViewMode === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
            >
              Mês
            </button>
            <button
              onClick={() => setInstructorViewMode('annual')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${instructorViewMode === 'annual'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
            >
              Ano
            </button>
          </div>
        </div>

        {instructorStats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instructorStats.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors dark:border-slate-700 dark:hover:bg-slate-700/50">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0 dark:bg-blue-900/30 dark:text-blue-300">
                  {item.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-900 truncate dark:text-white text-sm" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      {item.count}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 dark:bg-slate-900">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(item.count / maxInstructorCount) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200 dark:bg-slate-800/50 dark:border-slate-700">
            <Calendar className="w-10 h-10 text-gray-300 mb-3 dark:text-gray-600" />
            <p className="text-gray-500 font-medium dark:text-gray-400">Nenhuma aula agendada</p>
            <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
              Não há aulas com status "Agendada" para o período de <span className="font-medium">
                {instructorViewMode === 'daily' && 'hoje'}
                {instructorViewMode === 'monthly' && 'este mês'}
                {instructorViewMode === 'annual' && 'este ano'}
              </span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};