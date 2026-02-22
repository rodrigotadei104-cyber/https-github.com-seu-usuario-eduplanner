import React, { useState, useMemo } from 'react';
import { formatHoras, formatHorasDetalhado, formatNumber } from '../lib/formatters';
import { Stats, Aula } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { Users, Clock, BookOpen, AlertCircle, CheckCircle, Calendar, Filter, ArrowRight } from 'lucide-react';
import { format, isSameMonth, eachMonthOfInterval, startOfYear, endOfYear, getMonth, isSameDay, isSameYear, isWithinInterval, parse, differenceInMinutes, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services/aula.service';
import { Avatar } from './Avatar';

interface DashboardProps {
  stats: Stats;
  allAulas: Aula[];
  currentDate: Date;
  onNavigateToMonth: (date: Date) => void;
}



// --- Internal Component for Workload Reports ---


export const Dashboard: React.FC<DashboardProps> = ({ currentDate, onNavigateToMonth }) => {
  const { setViewMode, setFilters, filters, filteredAulas } = useSchedule();
  const [instructorViewMode, setInstructorViewMode] = useState<'daily' | 'monthly' | 'annual'>('monthly');

  const start = startOfYear(currentDate);
  const end = endOfYear(currentDate);
  const months = eachMonthOfInterval({ start, end });
  const currentYearLabel = format(currentDate, 'yyyy');

  // --- 1. Calculate Stats Specific to the Viewed Month ---
  const periodStats = useMemo(() => {
    // Define monthly boundaries based on 'currentDate'
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const periodAulas = filteredAulas.filter(a =>
      isWithinInterval(parseLocalDate(a.data), { start: monthStart, end: monthEnd })
    );

    let totalMinutes = 0;
    let totalHorasAula = 0; // NEW: Sum of cargaHorariaMateria
    const instructors = new Set<string>();
    const uniqueCourses = new Set<string>(); // NEW: Track unique course numbers
    const statusCounts = {
      agendada: 0,
      'em-andamento': 0,
      concluida: 0,
      cancelada: 0
    };

    let activeClassesCount = 0;

    periodAulas.forEach(aula => {
      // Helper for duration calculation (Minutes)
      const getDuration = (start?: string, end?: string) => {
        if (!start || !end) return 0;
        try {
          const [h1, m1] = start.split(':').map(Number);
          const [h2, m2] = end.split(':').map(Number);
          if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
          return (h2 * 60 + m2) - (h1 * 60 + m1);
        } catch { return 0; }
      };

      // NEW: Sum hours/class by status instead of counting events
      // Prioritize cargaHorariaMateria, but fallback to duration calculation
      let horasAula = 0;
      if (aula.cargaHorariaMateria && !isNaN(Number(aula.cargaHorariaMateria)) && Number(aula.cargaHorariaMateria) > 0) {
        horasAula = Number(aula.cargaHorariaMateria);
      } else {
        const duration = getDuration(aula.horarioInicio, aula.horarioFim);
        if (duration > 0) {
          horasAula = Math.round((duration / (aula.minutosPorHora || 60)) * 100) / 100;
        }
      }

      if (statusCounts[aula.status as keyof typeof statusCounts] !== undefined) {
        statusCounts[aula.status as keyof typeof statusCounts] += horasAula;
      }

      // STRICT METRICS: Cancelled classes do NOT contribute to Headline Stats
      if (aula.status !== 'cancelada') {
        activeClassesCount++;
        if (aula.instrutor && aula.instrutor.trim() !== '') {
          instructors.add(aula.instrutor);
        }

        // Identification strictly by Cohort (Turma) first, then Course Number
        if (aula.numeroTurma) {
          uniqueCourses.add(String(aula.numeroTurma)); // e.g. "T01-2026"
        } else if (aula.numeroCurso) {
          uniqueCourses.add(String(aula.numeroCurso));
        } else {
          // Fallback only if number is missing (e.g. legacy data)
          uniqueCourses.add(`curso-${aula.curso}`);
        }

        totalHorasAula += horasAula;
        totalMinutes += getDuration(aula.horarioInicio, aula.horarioFim);
      }
    });


    return {
      totalAulas: totalHorasAula, // Always use workload sum (will be 0 if no data)
      totalHoras: Math.round(totalMinutes / 60),
      instrutoresAtivos: instructors.size,
      aulasPorStatus: statusCounts,
      activeClassesCount,
      uniqueCoursesCount: uniqueCourses.size // NEW: Return unique course count
    };
  }, [filteredAulas, currentDate]); // Re-run when currentDate changes (month navigation)

  const currentMonthLabel = format(currentDate, 'MMMM yyyy', { locale: ptBR });
  // Capitalize first letter
  const formattedPeriodLabel = currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1);


  // --- 2. Chart Data (Annual) ---
  // Uses 'filteredAulas' to ensure chart updates when user searches/filters in sidebar
  const chartData = months.map(month => {
    // NEW: Sum hours/class instead of counting events
    const monthAulas = filteredAulas.filter(a =>
      isSameMonth(parseLocalDate(a.data), month) && a.status !== 'cancelada'
    );

    const totalHorasAula = monthAulas.reduce((sum, aula) => {
      let horas = 0;
      if (aula.cargaHorariaMateria && !isNaN(Number(aula.cargaHorariaMateria)) && Number(aula.cargaHorariaMateria) > 0) {
        horas = Number(aula.cargaHorariaMateria);
      } else {
        const startTime = aula.horarioInicio?.substring(0, 5) || '00:00';
        const endTime = aula.horarioFim?.substring(0, 5) || '00:00';
        const s = parse(startTime, 'HH:mm', new Date());
        const e = parse(endTime, 'HH:mm', new Date());
        const diff = differenceInMinutes(e, s);
        if (!isNaN(diff) && diff > 0) {
          horas = Math.round((diff / (aula.minutosPorHora || 60)) * 100) / 100;
        }
      }
      return sum + horas;
    }, 0);

    return {
      name: format(month, 'MMM', { locale: ptBR }),
      fullName: format(month, 'MMMM', { locale: ptBR }),
      aulas: totalHorasAula, // Now represents hours/class, not event count
      date: month
    };
  });

  // --- 3. Instructor Stats Logic ---
  const instructorStats = useMemo(() => {
    // Filter by Status (Agendada only) and Time Period
    const filtered = filteredAulas.filter(a => {
      // FIX: Agora inclui Agendada, Em Andamento e Concluída (apenas remove Cancelada)
      if (a.status === 'cancelada') return false;

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

    // Group by Instructor - Sum hours/class instead of counting events
    const counts: Record<string, number> = {};
    filtered.forEach(a => {
      let horas = 0;
      if (a.cargaHorariaMateria && !isNaN(Number(a.cargaHorariaMateria)) && Number(a.cargaHorariaMateria) > 0) {
        horas = Number(a.cargaHorariaMateria);
      } else {
        const startTime = a.horarioInicio?.substring(0, 5) || '00:00';
        const endTime = a.horarioFim?.substring(0, 5) || '00:00';
        const s = parse(startTime, 'HH:mm', new Date());
        const e = parse(endTime, 'HH:mm', new Date());
        const diff = differenceInMinutes(e, s);
        if (!isNaN(diff) && diff > 0) {
          horas = Math.round((diff / (a.minutosPorHora || 60)) * 100) / 100;
        }
      }
      const instructorName = (a.instrutor || '').trim();
      if (!instructorName) return; // Skip classes with no instructor (deleted/orphaned)
      counts[instructorName] = (counts[instructorName] || 0) + horas;
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

  // --- 4. Monthly Instructor Comparison & Advanced Metrics ---
  const [comparisonYear, setComparisonYear] = useState<number>(currentDate.getFullYear());
  const [showAllInstructors, setShowAllInstructors] = useState<boolean>(false);

  // Existing comparison state
  const [comparisonData, setComparisonData] = useState<{
    months: string[];
    data: { instructorName: string; values: number[]; total: number }[];
  } | null>(null);

  // NEW: Historical & Projection State
  const [monthlyHistory, setMonthlyHistory] = useState<any[]>([]);
  const [projection, setProjection] = useState<{ averagePerMonth: number; projectedYearTotal: number }>({ averagePerMonth: 0, projectedYearTotal: 0 });
  const [trend, setTrend] = useState<{ currentMonth: number; previousMonth: number; growthRate: number }>({ currentMonth: 0, previousMonth: 0, growthRate: 0 });

  React.useEffect(() => {
    const fetchDeepMetrics = async () => {
      try {
        // 1. Instructor Comparison (Existing)
        const report = await aulaService.getInstructorMonthlyReport(comparisonYear);
        setComparisonData(report);

        // 2. Advanced Metrics (New) - Depends on currentDate
        const history = await aulaService.getMonthlyHistory(currentDate);
        setMonthlyHistory(history);

        const proj = await aulaService.getAnnualProjection(history);
        setProjection({
          averagePerMonth: proj.averageMonthly,
          projectedYearTotal: proj.projectedTotal
        });

        const growth = await aulaService.getGrowthTrend(history);
        setTrend(growth as any); // Type assertion until interface is shared

      } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
      }
    };
    fetchDeepMetrics();
  }, [comparisonYear, currentDate]); // Re-fetch when year or month changes

  // Transform data for Recharts
  const lineChartData = useMemo(() => {
    if (!comparisonData) return [];

    return comparisonData.months.map((month, index) => {
      const entry: any = { name: month };
      comparisonData.data.forEach(inst => {
        entry[inst.instructorName] = inst.values[index];
      });
      return entry;
    });
  }, [comparisonData]);

  const visibleInstructors = useMemo(() => {
    if (!comparisonData) return [];
    // Aumentado para 6 instrutores por padrão para evitar que o Deivid suma em caso de empate
    return showAllInstructors ? comparisonData.data : comparisonData.data.slice(0, 6);
  }, [comparisonData, showAllInstructors]);

  const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];





  const handleNavigateToCancelled = () => {
    setFilters({ ...filters, status: 'cancelada' });
    setViewMode('monthly');
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
          title="Total de Horas/Aula"
          value={formatHorasDetalhado(periodStats.totalAulas)}
          icon={BookOpen}
          color="bg-purple-500"
          subtext={`Carga horária em ${formattedPeriodLabel}`}
        />
        <StatCard
          title="Agendamentos"
          value={periodStats.activeClassesCount} // Event count moved to second card or kept distinct
          icon={Calendar}
          color="bg-blue-500"
          subtext={`Eventos em ${formattedPeriodLabel}`}
        />
        <StatCard
          title="Instrutores Ativos"
          value={periodStats.instrutoresAtivos}
          icon={Users}
          color="bg-indigo-500"
          subtext={`Em ${formattedPeriodLabel}`}
        />
        <StatCard
          title="Conclusão"
          value={`${periodStats.totalAulas > 0 ? Math.round((periodStats.aulasPorStatus.concluida / periodStats.totalAulas) * 100) : 0}%`}
          icon={CheckCircle}
          color="bg-teal-500"
          subtext={`${formatHoras(periodStats.aulasPorStatus.concluida)}h concluídas em ${formattedPeriodLabel}`}
        />
      </div>

      {/* NEW: Analytical Section (Trend, Projection, History) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* 1. Growth Trend Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-sm font-medium text-gray-500 mb-4 dark:text-gray-400">Tendência de Crescimento</h3>
          <div className="flex items-end gap-2 mb-2">
            <div className={`flex items-center gap-1 text-3xl font-bold ${trend.growthRate > 0 ? 'text-green-600 dark:text-green-400' : trend.growthRate < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {trend.growthRate > 0 ? '+' : ''}{Math.round(trend.growthRate)}%
            </div>
            <span className={`text-sm mb-1 font-medium px-2 py-0.5 rounded ${trend.growthRate > 0
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : trend.growthRate < 0
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
              {trend.growthRate > 0 ? 'Crescimento' : trend.growthRate < 0 ? 'Queda' : 'Estável'}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Comparativo: {formatHoras(trend.previousMonth)}h (mês anterior) vs {formatHoras(trend.currentMonth)}h (atual).
          </p>
        </div>

        {/* 2. Annual Projection Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-sm font-medium text-gray-500 mb-4 dark:text-gray-400">Projeção Anual</h3>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              ~{formatNumber(projection.projectedYearTotal, 0)}
            </span>
            <span className="text-sm mb-1 text-gray-500 dark:text-gray-400">horas/aula</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Baseado na média de {formatHoras(projection.averagePerMonth)}h/mês dos últimos 12 meses.
          </p>
        </div>

        {/* 3. Active Classes Card (Unique Course Numbers) */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-sm font-medium text-gray-500 mb-4 dark:text-gray-400">Turmas Abertas no Mês Atual</h3>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {periodStats.uniqueCoursesCount || 0}
            </span>
            <span className="text-sm mb-1 text-gray-500 dark:text-gray-400">turmas</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Baseado nos números de curso únicos com aulas em {formattedPeriodLabel}.
          </p>
        </div>
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
              { label: 'Agendada', val: periodStats.aulasPorStatus.agendada, color: 'bg-blue-500' },
              { label: 'Em Andamento', val: periodStats.aulasPorStatus['em-andamento'], color: 'bg-yellow-500' },
              { label: 'Concluída', val: periodStats.aulasPorStatus.concluida, color: 'bg-teal-500' },
              { label: 'Cancelada', val: periodStats.aulasPorStatus.cancelada, color: 'bg-red-500' },
            ].map((item) => {
              // Percentage base includes cancelled for Distribution view clarity
              const totalForDistribution =
                periodStats.aulasPorStatus.agendada +
                periodStats.aulasPorStatus['em-andamento'] +
                periodStats.aulasPorStatus.concluida +
                periodStats.aulasPorStatus.cancelada;

              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatHoras(item.val)}h</span>
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
                {formatHoras(periodStats.aulasPorStatus.cancelada)}h canceladas em {formattedPeriodLabel}.
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
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Hora/aula por Instrutor</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total de horas/aula ativas (Agendadas, Em andamento e Concluídas)</p>
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
                <Avatar
                  name={item.name}
                  size="md"
                  className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-900 truncate dark:text-white text-sm" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      {formatHoras(item.count)}h
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



      <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Comparativo Mensal de Instrutores</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Evolução de horas/aula ativas por mês em {comparisonYear}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={comparisonYear}
              onChange={(e) => setComparisonYear(Number(e.target.value))}
              className="p-2 border rounded-lg text-sm bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)'
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              {visibleInstructors.map((inst, index) => (
                <Line
                  key={inst.instructorName}
                  type="monotone"
                  dataKey={inst.instructorName}
                  name={inst.instructorName}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  // Cycle stroke width: 4px, 3px, 2px to show nested lines on overlap
                  strokeWidth={4 - (index % 3)}
                  strokeOpacity={0.8}
                  strokeDasharray={index % 2 === 0 ? "0" : "4 4"}
                  dot={{ r: 4, fill: LINE_COLORS[index % LINE_COLORS.length], strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {comparisonData && comparisonData.data.length > 3 && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowAllInstructors(!showAllInstructors)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              {showAllInstructors ? 'Mostrar menos' : `Ver todos (${comparisonData.data.length})`}
            </button>
          </div>
        )}

        {/* Diagnostic Table - To prove existence */}
        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full text-xs text-left text-gray-500 dark:text-gray-400">
            <thead className="bg-gray-50 dark:bg-slate-700 font-medium">
              <tr>
                <th className="px-4 py-2">Instrutor</th>
                <th className="px-4 py-2">Total Anual</th>
                {comparisonData?.months.map(m => <th key={m} className="px-4 py-2">{m}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700">
              {visibleInstructors.map((inst, idx) => (
                <tr key={inst.instructorName} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}></div>
                    {inst.instructorName}
                  </td>
                  <td className="px-4 py-2 font-bold">{formatHoras(inst.total)}h</td>
                  {inst.values.map((v, i) => <td key={i} className="px-4 py-2">{v > 0 ? formatHoras(v) : '-'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div >
  );
};