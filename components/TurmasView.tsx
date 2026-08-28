import React, { useState, useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { Aula } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Check, ChevronRight, ArrowLeft, Clock3, MapPin } from 'lucide-react';

const toMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const horarioCurto = (horario: string) => String(horario || '').slice(0, 5);

interface ResumoTurma {
    chave: string;
    numeroTurma: string;
    curso: string;
    inicio: Date;
    termino: Date;
    totalAulas: number;
    aulasDadas: number;
    horas: number;
    instrutores: string[];
    status: 'planejada' | 'andamento' | 'encerrada';
    recorrencia: string;
    proxima?: Aula;
    totalDias: number;
    aulas: Aula[];
}

type Ordenacao = 'termino' | 'inicio' | 'curso';

export const TurmasView: React.FC = () => {
    const { aulas } = useSchedule();
    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState<Ordenacao>('termino');
    const [statusFiltro, setStatusFiltro] = useState<'andamento' | 'planejada' | 'encerrada' | 'todas'>('andamento');
    const [turmaSelecionada, setTurmaSelecionada] = useState<ResumoTurma | null>(null);

    const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

    // Clique no Id da turma copia direto pra área de transferência (sem selecionar).
    const [copiado, setCopiado] = useState<string | null>(null);
    const copiarTurma = async (nt: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(nt);
            } else {
                const ta = document.createElement('textarea');
                ta.value = nt; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
            }
            setCopiado(nt);
            window.setTimeout(() => setCopiado(c => (c === nt ? null : c)), 1200);
        } catch { /* silencioso — sem quebrar a tela se o clipboard for bloqueado */ }
    };
    const turmaCopiavel = (nt: string) => (
        <button type="button" onClick={() => copiarTurma(nt)}
            title="Clique para copiar o Id da turma"
            className="group inline-flex items-center gap-1 font-mono font-bold text-gray-700 dark:text-gray-200 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer">
            <span>{nt}</span>
            {copiado === nt
                ? <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-600 uppercase tracking-wide"><Check className="w-3 h-3" />copiado</span>
                : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
        </button>
    );

    const turmas = useMemo<ResumoTurma[]>(() => {
        const grupos = new Map<string, Aula[]>();
        (aulas as Aula[]).forEach(a => {
            const nt = a.numeroTurma || a.numeroCurso;
            if (!nt) return;
            if (!(a.data instanceof Date) || Number.isNaN(a.data.getTime())) return;
            // turmaId é a identidade para o novo modelo; o fallback preserva registros legados.
            const chave = a.turmaId ? `turma:${a.turmaId}` : `legado:${a.cursoId || a.curso}:${nt}`;
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave)!.push(a);
        });

        const lista: ResumoTurma[] = [];
        for (const [chave, arr] of grupos) {
            const nt = arr.find(a => a.numeroTurma)?.numeroTurma || arr.find(a => a.numeroCurso)?.numeroCurso || 'Sem identificação';
            const ativas = arr.filter(a => a.status !== 'cancelada');
            if (ativas.length === 0) continue;
            const datas = ativas.map(a => a.data.getTime());
            const inicio = new Date(Math.min(...datas));
            const termino = new Date(Math.max(...datas));
            const diasComAula = new Set(ativas.map(a => format(a.data, 'yyyy-MM-dd')));
            const aulasDadas = new Set(ativas.filter(a => { const d = new Date(a.data); d.setHours(0, 0, 0, 0); return a.status === 'concluida' || d < hoje; }).map(a => format(a.data, 'yyyy-MM-dd'))).size;
            const horas = ativas.reduce((acc, a) => acc + Math.max(0, (toMin(a.horarioFim) - toMin(a.horarioInicio)) / 60), 0);
            const instrutores = Array.from(new Set(ativas.map(a => a.instrutor).filter(Boolean)));
            // curso mais frequente do grupo
            const cursoCount = new Map<string, number>();
            ativas.forEach(a => cursoCount.set(a.curso || '—', (cursoCount.get(a.curso || '—') || 0) + 1));
            const curso = [...cursoCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '—';

            let status: ResumoTurma['status'] = 'andamento';
            if (hoje < new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())) status = 'planejada';
            else if (hoje > new Date(termino.getFullYear(), termino.getMonth(), termino.getDate())) status = 'encerrada';

            const aulasPorDia = new Map<string, Aula[]>();
            ativas.forEach(aula => {
                const data = format(aula.data, 'yyyy-MM-dd');
                aulasPorDia.set(data, [...(aulasPorDia.get(data) || []), aula]);
            });
            // Uma turma pode ter várias disciplinas dentro do mesmo turno. Para o resumo,
            // o compromisso é o intervalo total do dia, não cada fragmento pedagógico.
            const turnosPorDia = Array.from(aulasPorDia.values()).map(aulasDoDia => ({
                dia: aulasDoDia[0].data.getDay(),
                inicio: horarioCurto(aulasDoDia.sort((a, b) => toMin(a.horarioInicio) - toMin(b.horarioInicio))[0].horarioInicio),
                fim: horarioCurto(aulasDoDia.sort((a, b) => toMin(b.horarioFim) - toMin(a.horarioFim))[0].horarioFim),
            }));
            const dias = Array.from(new Set(turnosPorDia.map(turno => turno.dia))).sort((a, b) => a - b);
            const slots = Array.from(new Set(turnosPorDia.map(turno => `${turno.inicio}–${turno.fim}`)));
            const datasCurtas = Array.from(new Set(ativas.map(a => format(a.data, 'dd MMM', { locale: ptBR }))));
            const recorrencia = diasComAula.size <= 3
                ? `${datasCurtas.join(', ').replace(/, ([^,]*)$/, ' e $1')}${slots.length === 1 ? ` · ${slots[0]}` : ''}`
                : slots.length === 1 ? `${dias.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(' · ')} · ${slots[0]}` : 'Agenda personalizada';
            const proxima = ativas.filter(a => { const d = new Date(a.data); d.setHours(0, 0, 0, 0); return d >= hoje && a.status !== 'concluida'; }).sort((a, b) => a.data.getTime() - b.data.getTime() || toMin(a.horarioInicio) - toMin(b.horarioInicio))[0];
            lista.push({ chave, numeroTurma: nt, curso, inicio, termino, totalAulas: diasComAula.size, totalDias: diasComAula.size, aulasDadas, diasConcluidos: aulasDadas, horas: Math.round(horas * 10) / 10, instrutores, status, recorrencia, proxima, aulas: [...arr].sort((a, b) => a.data.getTime() - b.data.getTime() || toMin(a.horarioInicio) - toMin(b.horarioInicio)) });
        }
        return lista;
    }, [aulas, hoje]);

    const contagem = useMemo(() => ({
        andamento: turmas.filter(t => t.status === 'andamento').length,
        planejada: turmas.filter(t => t.status === 'planejada').length,
        encerrada: turmas.filter(t => t.status === 'encerrada').length,
        todas: turmas.length,
    }), [turmas]);

    const buscando = busca.trim().length > 0;

    const filtradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        let l = turmas;
        if (q) {
            // A busca varre TODAS as turmas (inclusive encerradas ocultas), pra você achar pelo Id.
            l = turmas.filter(t => t.numeroTurma.toLowerCase().includes(q) || t.curso.toLowerCase().includes(q) || t.instrutores.some(i => i.toLowerCase().includes(q)));
        } else if (statusFiltro !== 'todas') {
            l = turmas.filter(t => t.status === statusFiltro);
        }
        return [...l].sort((a, b) => {
            if (ordem === 'curso') return a.curso.localeCompare(b.curso);
            if (ordem === 'inicio') return a.inicio.getTime() - b.inicio.getTime();
            return a.termino.getTime() - b.termino.getTime();
        });
    }, [turmas, busca, ordem, statusFiltro]);

    // Este retorno precisa ficar depois de todos os hooks da tela. Retornar antes
    // fazia o React executar uma quantidade diferente de hooks após o clique.
    if (turmaSelecionada) return <AgendaDetalhada turma={turmaSelecionada} onBack={() => setTurmaSelecionada(null)} />;

    const badge = (s: ResumoTurma['status']) => {
        if (s === 'planejada') return { txt: 'Planejada', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
        if (s === 'encerrada') return { txt: 'Encerrada', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' };
        return { txt: 'Em andamento', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tighter border-b-2 border-teal-600 inline-block">Turmas</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Agenda efetiva, próxima aula e progresso calculados a partir das aulas da turma.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar Id da turma, curso ou instrutor..."
                        className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-white w-64 focus:outline-none focus:ring-2 focus:ring-teal-300" />
                    <select value={ordem} onChange={e => setOrdem(e.target.value as Ordenacao)} className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-900 dark:text-white">
                        <option value="termino">Ordenar: termina antes</option>
                        <option value="inicio">Ordenar: começou antes</option>
                        <option value="curso">Ordenar: curso (A-Z)</option>
                    </select>
                </div>
            </div>

            <div className="px-6 py-2.5 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
                    {([
                        { k: 'andamento', l: 'Em andamento', n: contagem.andamento },
                        { k: 'planejada', l: 'Planejadas', n: contagem.planejada },
                        { k: 'encerrada', l: 'Encerradas', n: contagem.encerrada },
                        { k: 'todas', l: 'Todas', n: contagem.todas },
                    ] as const).map(f => (
                        <button key={f.k} onClick={() => setStatusFiltro(f.k)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wide transition ${!buscando && statusFiltro === f.k ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                            {f.l} <span className="opacity-70">({f.n})</span>
                        </button>
                    ))}
                </div>
                <span className="text-xs text-slate-400 ml-auto">
                    {buscando ? `${filtradas.length} resultado(s) — busca varre todas as turmas` : `${filtradas.length} turma(s)`}
                </span>
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
                {filtradas.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <p className="text-lg font-bold uppercase tracking-widest">{turmas.length === 0 ? 'Nenhuma turma com aulas' : 'Nenhum resultado'}</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ minWidth: 820 }}>
                                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0">
                                    <tr>
                                        {['Id Turma', 'Curso', 'Período efetivo', 'Progresso', 'Próxima aula', 'Status', ''].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtradas.map((t, i) => {
                                        const b = badge(t.status);
                                        const pct = t.totalAulas > 0 ? Math.round((t.aulasDadas / t.totalAulas) * 100) : 0;
                                        return (
                                            <tr key={t.chave} className={`border-b border-gray-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/40 dark:bg-slate-800/40' : ''}`}>
                                                <td className="px-3 py-2 whitespace-nowrap">{turmaCopiavel(t.numeroTurma)}</td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200 max-w-[240px] truncate" title={t.curso}>{t.curso}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{format(t.inicio, 'dd MMM yy', { locale: ptBR })} <span className="text-slate-400">→</span> {format(t.termino, 'dd MMM yy', { locale: ptBR })}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-[11px] text-slate-500 tabular-nums">{t.aulasDadas}/{t.totalAulas}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap text-[12px]">{t.proxima ? <><span className="font-semibold text-gray-800 dark:text-gray-100">{format(t.proxima.data, 'dd MMM', { locale: ptBR })}</span><span className="text-slate-500"> · {horarioCurto(t.proxima.horarioInicio)}</span></> : <span className="text-slate-400">—</span>}</td>
                                                <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${b.cls}`}>{b.txt}</span></td>
                                                <td className="px-3 py-2 text-right"><button onClick={() => setTurmaSelecionada(t)} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 dark:text-teal-300 hover:text-teal-900">Ver agenda <ChevronRight className="w-4 h-4" /></button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TurmasView;

const AgendaDetalhada: React.FC<{ turma: ResumoTurma; onBack: () => void }> = ({ turma, onBack }) => {
    const aulasPorMes = turma.aulas.reduce((grupos, aula) => {
        const chave = format(aula.data, 'MMMM yyyy', { locale: ptBR });
        grupos.set(chave, [...(grupos.get(chave) || []), aula]);
        return grupos;
    }, new Map<string, Aula[]>());

    return <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden">
        <header className="px-6 py-5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300"><ArrowLeft className="w-4 h-4" /> Voltar para Turmas</button>
            <div className="mt-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div><p className="text-xs uppercase tracking-[0.16em] font-bold text-teal-700 dark:text-teal-300">Agenda da turma</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{turma.curso}</h1><p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">{turma.numeroTurma}</p></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm"><InfoAgenda label="Período" valor={`${format(turma.inicio, 'dd MMM', { locale: ptBR })} → ${format(turma.termino, 'dd MMM yy', { locale: ptBR })}`} /><InfoAgenda label="Agenda" valor={turma.recorrencia} /><InfoAgenda label="Dias com aula" valor={String(turma.totalDias)} /></div>
            </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar"><div className="max-w-4xl mx-auto space-y-8">{Array.from(aulasPorMes.entries()).map(([mes, aulas]) => <section key={mes}><h2 className="mb-3 capitalize text-sm font-black tracking-wide text-slate-500 dark:text-slate-400">{mes}</h2><div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">{aulas.map(aula => <article key={aula.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-32"><div className="text-xs font-black uppercase tracking-wide text-slate-500">{format(aula.data, 'EEE, dd MMM', { locale: ptBR })}</div><div className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-800 dark:text-white"><Clock3 className="w-3.5 h-3.5 text-teal-600" />{horarioCurto(aula.horarioInicio)}–{horarioCurto(aula.horarioFim)}</div></div><div className="flex-1"><div className="font-semibold text-slate-800 dark:text-slate-100">{aula.materia || turma.curso}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">{aula.instrutor && <span>{aula.instrutor}</span>}{aula.sala && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{aula.sala}</span>}</div></div><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold ${aula.status === 'cancelada' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : aula.status === 'concluida' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : aula.aulaExtra ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200'}`}>{aula.aulaExtra ? 'Aula extra' : aula.status === 'em-andamento' ? 'Em andamento' : aula.status.charAt(0).toUpperCase() + aula.status.slice(1)}</span></article>)}</div></section>)}</div></main>
    </div>;
};

const InfoAgenda: React.FC<{ label: string; valor: string }> = ({ label, valor }) => <div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 max-w-56 truncate font-semibold text-slate-700 dark:text-slate-200" title={valor}>{valor}</div></div>;
