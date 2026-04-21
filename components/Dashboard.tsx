import React, { useState, useMemo } from 'react';
import { formatHoras, formatHorasDetalhado, formatNumber } from '../lib/formatters';
import { Stats, Aula } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { format, isSameMonth, eachMonthOfInterval, startOfYear, endOfYear, getMonth, isSameDay, isSameYear, isWithinInterval, parse, differenceInMinutes, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};
import { useSchedule } from '../context/ScheduleContext';
import { aulaService } from '../services/aula.service';

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

  // --- 1. Calculate Stats Specific to the Viewed Month ---
  const periodStats = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const periodAulas = filteredAulas.filter(a =>
      isWithinInterval(parseLocalDate(a.data), { start: monthStart, end: monthEnd })
    );

    let totalMinutes = 0;
    let totalHorasAula = 0;
    const instructors = new Set<string>();
    const uniqueCourses = new Set<string>();
    const statusCounts = {
      agendada: 0,
      'em-andamento': 0,
      concluida: 0,
      cancelada: 0
    };

    let activeClassesCount = 0;

    periodAulas.forEach(aula => {
      const getDuration = (start?: string, end?: string) => {
        if (!start || !end) return 0;
        try {
          const [h1, m1] = start.split(':').map(Number);
          const [h2, m2] = end.split(':').map(Number);
          return (h2 * 60 + m2) - (h1 * 60 + m1);
        } catch { return 0; }
      };

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

      if (aula.status !== 'cancelada') {
        activeClassesCount++;
        if (aula.instrutor) instructors.add(aula.instrutor);
        if (aula.numeroTurma) uniqueCourses.add(String(aula.numeroTurma));
        else if (aula.numeroCurso) uniqueCourses.add(String(aula.numeroCurso));
        
        totalHorasAula += horasAula;
        totalMinutes += getDuration(aula.horarioInicio, aula.horarioFim);
      }
    });

    return {
      totalAulas: totalHorasAula,
      totalHoras: Math.round(totalMinutes / 60),
      instrutoresAtivos: instructors.size,
      aulasPorStatus: statusCounts,
      activeClassesCount,
      uniqueCoursesCount: uniqueCourses.size
    };
  }, [filteredAulas, currentDate]);

  const currentMonthLabel = format(currentDate, 'MMMM yyyy', { locale: ptBR });
  const formattedPeriodLabel = currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1);

  // --- 2. Chart Data (Annual) ---
  const chartData = months.map(month => {
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
        if (!isNaN(diff) && diff > 0) horas = Math.round((diff / (aula.minutosPorHora || 60)) * 100) / 100;
      }
      return sum + horas;
    }, 0);

    return {
      name: format(month, 'MMM', { locale: ptBR }),
      fullName: format(month, 'MMMM', { locale: ptBR }),
      aulas: totalHorasAula,
      date: month
    };
  });

  // --- 3. Instructor Stats Logic ---
  const instructorStats = useMemo(() => {
    const filtered = filteredAulas.filter(a => {
      if (a.status === 'cancelada') return false;
      const aulaDate = parseLocalDate(a.data);
      if (instructorViewMode === 'daily') return isSameDay(aulaDate, currentDate);
      if (instructorViewMode === 'monthly') return isSameMonth(aulaDate, currentDate);
      if (instructorViewMode === 'annual') return isSameYear(aulaDate, currentDate);
      return false;
    });

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
        if (!isNaN(diff) && diff > 0) horas = Math.round((diff / (a.minutosPorHora || 60)) * 100) / 100;
      }
      const instructorName = (a.instrutor || '').trim();
      if (instructorName) counts[instructorName] = (counts[instructorName] || 0) + horas;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredAulas, currentDate, instructorViewMode]);

  const maxInstructorCount = Math.max(...instructorStats.map(i => i.count), 0);

  // --- 4. Deep Metrics ---
  const [comparisonYear, setComparisonYear] = useState<number>(currentDate.getFullYear());
  const [showAllInstructors, setShowAllInstructors] = useState<boolean>(false);
  const [comparisonData, setComparisonData] = useState<{
    months: string[];
    data: { instructorName: string; values: number[]; total: number }[];
  } | null>(null);
  const [projection, setProjection] = useState<{ averagePerMonth: number; projectedYearTotal: number }>({ averagePerMonth: 0, projectedYearTotal: 0 });
  const [trend, setTrend] = useState<{ currentMonth: number; previousMonth: number; growthRate: number }>({ currentMonth: 0, previousMonth: 0, growthRate: 0 });

  React.useEffect(() => {
    const fetchDeepMetrics = async () => {
      try {
        const report = await aulaService.getInstructorMonthlyReport(comparisonYear);
        setComparisonData(report);
        const history = await aulaService.getMonthlyHistory(currentDate);
        const proj = await aulaService.getAnnualProjection(history);
        setProjection({ averagePerMonth: proj.averageMonthly, projectedYearTotal: proj.projectedTotal });
        const growth = await aulaService.getGrowthTrend(history);
        setTrend(growth as any);
      } catch (error) { console.error(error); }
    };
    fetchDeepMetrics();
  }, [comparisonYear, currentDate]);

  const lineChartData = useMemo(() => {
    if (!comparisonData) return [];
    return comparisonData.months.map((month, index) => {
      const entry: any = { name: month };
      comparisonData.data.forEach(inst => entry[inst.instructorName] = inst.values[index]);
      return entry;
    });
  }, [comparisonData]);

  const visibleInstructors = useMemo(() => {
    if (!comparisonData) return [];
    return showAllInstructors ? comparisonData.data : comparisonData.data.slice(0, 6);
  }, [comparisonData, showAllInstructors]);

  const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

  const handleNavigateToCancelled = () => {
    setFilters({ ...filters, status: 'cancelada' });
    setViewMode('monthly');
  };
  const StatCard = ({ title, value, subtext, textGradient, glowColor }: any) => {
    return (
      <div className="group relative overflow-hidden bg-white p-5 rounded-[16px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between">
        <div className={`absolute -top-6 -right-6 w-32 h-32 opacity-15 blur-2xl rounded-full ${glowColor} pointer-events-none group-hover:opacity-25 transition-opacity duration-500`}></div>
        <div className="relative z-10 flex-1 flex flex-col justify-center">
           <p className="text-[12px] font-semibold text-slate-500 mb-1">{title}</p>
           <h3 className={`text-[26px] font-black tracking-tight leading-none mb-1 text-transparent bg-clip-text bg-gradient-to-br ${textGradient}`}>{value}</h3>
           {subtext && <p className="text-[11px] font-medium text-slate-400">{subtext}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar pt-6 pb-10 px-2 lg:px-8">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard
          title="Total de Horas/Aula"
          value={formatHorasDetalhado(periodStats.totalAulas)}
          subtext={`Carga horária em ${formattedPeriodLabel}`}
          textGradient="from-indigo-600 to-blue-500"
          glowColor="bg-blue-400"
        />
        <StatCard
          title="Agendamentos"
          value={periodStats.activeClassesCount} 
          subtext={`Eventos em ${formattedPeriodLabel}`}
          textGradient="from-rose-500 to-orange-500"
          glowColor="bg-rose-400"
        />
        <StatCard
          title="Instrutores Ativos"
          value={periodStats.instrutoresAtivos}
          subtext={`Em ${formattedPeriodLabel}`}
          textGradient="from-violet-600 to-fuchsia-500"
          glowColor="bg-fuchsia-400"
        />
        <StatCard
          title="Conclusão"
          value={`${periodStats.totalAulas > 0 ? Math.round((periodStats.aulasPorStatus.concluida / periodStats.totalAulas) * 100) : 0}%`}
          subtext={`${formatHoras(periodStats.aulasPorStatus.concluida)}h concluídas em ${formattedPeriodLabel}`}
          textGradient="from-emerald-500 to-teal-500"
          glowColor="bg-emerald-400"
        />
      </div>

      {/* Analytical Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className="group relative overflow-hidden bg-white p-5 rounded-[16px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-center">
          <div className="absolute -bottom-6 -left-6 w-32 h-32 opacity-15 blur-2xl rounded-full bg-emerald-400 pointer-events-none group-hover:opacity-25 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <p className="text-[12px] font-semibold text-slate-500 mb-1">Tendência de Crescimento</p>
            <div className="flex items-center gap-3 mb-1">
              <h3 className={`text-[26px] leading-none font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br ${trend.growthRate >= 0 ? 'from-emerald-500 to-teal-500' : 'from-rose-500 to-red-500'}`}>
                {trend.growthRate > 0 ? '+' : ''}{Math.round(trend.growthRate)}%
              </h3>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm border ${trend.growthRate >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-700 bg-rose-50 border-rose-100'}`}>
                {trend.growthRate >= 0 ? 'Crescimento' : 'Queda'}
              </span>
            </div>
          </div>
          <p className="relative z-10 text-[11px] font-medium text-slate-400">Comparativo: {formatHoras(trend.previousMonth)}h (ant) vs {formatHoras(trend.currentMonth)}h (at).</p>
        </div>

        <div className="group relative overflow-hidden bg-white p-5 rounded-[16px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 flex flex-col items-center justify-center text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 opacity-[0.08] blur-2xl rounded-full bg-blue-500 pointer-events-none group-hover:opacity-15 transition-opacity duration-500"></div>
          <div className="relative z-10 flex flex-col items-center w-full">
            <p className="text-[12px] font-semibold text-slate-500 mb-1">Projeção Anual</p>
            <div className="flex items-baseline justify-center gap-1.5 mb-1">
              <span className="text-[18px] font-bold text-slate-300">~</span>
              <h3 className="text-[28px] leading-none font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-700 to-slate-900 dark:from-white dark:to-slate-300">
                {formatNumber(projection.projectedYearTotal, 0)}
              </h3>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">horas/aula</span>
            </div>
          </div>
          <p className="relative z-10 text-[11px] font-medium text-slate-400">Base: {formatHoras(projection.averagePerMonth)}h/mês (12 meses)</p>
        </div>

        <div className="group relative overflow-hidden bg-white p-5 rounded-[16px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-center">
          <div className="absolute -top-6 -left-6 w-32 h-32 opacity-15 blur-2xl rounded-full bg-amber-400 pointer-events-none group-hover:opacity-25 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <p className="text-[12px] font-semibold text-slate-500 mb-1">Turmas Abertas no Mês</p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <h3 className="text-[26px] leading-none font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-amber-500 to-orange-500">
                {periodStats.uniqueCoursesCount || 0}
              </h3>
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider border border-amber-200 bg-amber-50 px-1.5 py-0.5 rounded">Turmas</span>
            </div>
          </div>
          <p className="relative z-10 text-[11px] font-medium text-slate-400">Base: cursos únicos em {formattedPeriodLabel}.</p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 mb-8 dark:text-white">Distribuição Anual de Aulas ({currentYearLabel})</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:opacity-10" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="aulas" radius={[6, 6, 0, 0]} onClick={(data: any) => data?.date && onNavigateToMonth(data.date)}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={isSameMonth(entry.date, currentDate) ? '#3b82f6' : '#cbd5e1'} className="cursor-pointer hover:opacity-80 transition-opacity" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 mb-8 dark:text-white">Status das Aulas ({currentYearLabel})</h3>
          <div className="space-y-6">
            {[
              { label: 'Agendada', val: periodStats.aulasPorStatus.agendada, color: 'bg-blue-600', valDisplay: `${formatHoras(periodStats.aulasPorStatus.agendada)}h` },
              { label: 'Em Andamento', val: periodStats.aulasPorStatus['em-andamento'], color: 'bg-amber-500', valDisplay: `${formatHoras(periodStats.aulasPorStatus['em-andamento'])}h` },
              { label: 'Concluída', val: periodStats.aulasPorStatus.concluida, color: 'bg-teal-500', valDisplay: `${formatHoras(periodStats.aulasPorStatus.concluida)}h` },
              { label: 'Cancelada', val: periodStats.aulasPorStatus.cancelada, color: 'bg-slate-400', valDisplay: `${formatHoras(periodStats.aulasPorStatus.cancelada)}h` },
            ].map((item) => {
              const totalForDistribution = periodStats.aulasPorStatus.agendada + periodStats.aulasPorStatus['em-andamento'] + periodStats.aulasPorStatus.concluida + periodStats.aulasPorStatus.cancelada;
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs font-bold mb-2">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="text-slate-900 dark:text-white">{item.valDisplay}</span>
                  </div>
                  <div className="w-full bg-slate-50 rounded-full h-2 dark:bg-slate-700">
                    <div className={`h-2 rounded-full ${item.color} transition-all duration-700`} style={{ width: `${totalForDistribution > 0 ? (item.val / totalForDistribution) * 100 : 0}%` }}></div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-10 pt-6 border-t border-slate-50">
             <button onClick={handleNavigateToCancelled} className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors uppercase tracking-widest">Ver Aulas Canceladas</button>
          </div>
        </div>
      </div>

      {/* --- RESTORATION: Instrutores e Analytics Detalhado --- */}
      <div className="grid grid-cols-1 gap-8 mb-8">
        {/* Hora Aula por Instrutor */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Hora Aula por Instrutor</h3>
            <div className="flex gap-1 bg-slate-50 p-1 rounded-lg dark:bg-slate-700">
              {(['daily', 'monthly', 'annual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setInstructorViewMode(mode)}
                  className={`px-3 py-1 rounded-md capitalize text-[10px] font-bold transition-all ${instructorViewMode === mode ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {mode === 'daily' ? 'Dia' : mode === 'monthly' ? 'Mês' : 'Ano'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {instructorStats.length > 0 ? (
              instructorStats.map((inst) => {
                const initials = inst.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                return (
                  <div key={inst.name} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 dark:bg-slate-800/50 dark:border-slate-700 group hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-black text-xs shrink-0 dark:bg-blue-900/30 dark:text-blue-400">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <h4 className="text-xs font-bold text-slate-700 dark:text-white truncate pr-2">{inst.name}</h4>
                          <span className="text-[10px] font-black text-slate-900 dark:text-slate-300 tabular-nums">{formatHoras(inst.count)}h</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${maxInstructorCount > 0 ? (inst.count / maxInstructorCount) * 100 : 0}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full h-32 flex items-center justify-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Nenhum registro para este período</p>
              </div>
            )}
          </div>
        </div>

        {/* Comparativo Mensal de Instrutores */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Comparativo Mensal</h3>
            <select
              value={comparisonYear}
              onChange={(e) => setComparisonYear(Number(e.target.value))}
              className="bg-slate-50 border-none text-[10px] font-bold text-slate-600 rounded-lg px-3 py-1 outline-none dark:bg-slate-700 dark:text-white"
            >
              {[currentDate.getFullYear(), currentDate.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:opacity-10" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }} />
                {visibleInstructors.map((inst, index) => (
                  <Line
                    key={inst.instructorName}
                    type="monotone"
                    dataKey={inst.instructorName}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Instrutor</th>
                  <th className="py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right px-4">Total Anual</th>
                  {comparisonData?.months.map(month => (
                    <th key={month} className="py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">{month}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {visibleInstructors.map((inst, idx) => (
                  <tr key={inst.instructorName} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}></div>
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{inst.instructorName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[10px] font-black text-slate-900 dark:text-white">{formatHoras(inst.total)}h</span>
                    </td>
                    {inst.values.map((val, i) => (
                      <td key={i} className="py-3 text-center">
                        <span className="text-[10px] text-slate-500 tabular-nums">{val > 0 ? formatHoras(val) : '-'}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4 dark:border-slate-800">
             <div className="flex flex-wrap gap-3">
               <button onClick={() => setShowAllInstructors(!showAllInstructors)} className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest">
                 {showAllInstructors ? 'Ver Menos' : 'Ver todos'} ({comparisonData?.data.length})
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};