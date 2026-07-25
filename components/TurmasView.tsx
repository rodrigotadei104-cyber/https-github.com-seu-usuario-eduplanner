import React, { useState, useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { Aula } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Check } from 'lucide-react';

const toMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

interface ResumoTurma {
    numeroTurma: string;
    curso: string;
    inicio: Date;
    termino: Date;
    totalAulas: number;
    aulasDadas: number;
    horas: number;
    instrutores: string[];
    status: 'planejada' | 'andamento' | 'encerrada';
}

type Ordenacao = 'termino' | 'inicio' | 'curso';

export const TurmasView: React.FC = () => {
    const { aulas } = useSchedule();
    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState<Ordenacao>('termino');
    const [statusFiltro, setStatusFiltro] = useState<'andamento' | 'planejada' | 'encerrada' | 'todas'>('andamento');

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
            if (!(a.data instanceof Date)) return;
            if (!grupos.has(nt)) grupos.set(nt, []);
            grupos.get(nt)!.push(a);
        });

        const lista: ResumoTurma[] = [];
        for (const [nt, arr] of grupos) {
            const ativas = arr.filter(a => a.status !== 'cancelada');
            if (ativas.length === 0) continue;
            const datas = ativas.map(a => a.data.getTime());
            const inicio = new Date(Math.min(...datas));
            const termino = new Date(Math.max(...datas));
            const aulasDadas = ativas.filter(a => { const d = new Date(a.data); d.setHours(0, 0, 0, 0); return d < hoje; }).length;
            const horas = ativas.reduce((acc, a) => acc + Math.max(0, (toMin(a.horarioFim) - toMin(a.horarioInicio)) / 60), 0);
            const instrutores = Array.from(new Set(ativas.map(a => a.instrutor).filter(Boolean)));
            // curso mais frequente do grupo
            const cursoCount = new Map<string, number>();
            ativas.forEach(a => cursoCount.set(a.curso || '—', (cursoCount.get(a.curso || '—') || 0) + 1));
            const curso = [...cursoCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '—';

            let status: ResumoTurma['status'] = 'andamento';
            if (hoje < new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())) status = 'planejada';
            else if (hoje > new Date(termino.getFullYear(), termino.getMonth(), termino.getDate())) status = 'encerrada';

            lista.push({ numeroTurma: nt, curso, inicio, termino, totalAulas: ativas.length, aulasDadas, horas: Math.round(horas * 10) / 10, instrutores, status });
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Início, previsão de término e progresso de cada turma — calculado das aulas.</p>
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
                            <table className="w-full text-sm" style={{ minWidth: 900 }}>
                                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0">
                                    <tr>
                                        {['Id Turma', 'Curso', 'Início', 'Término (prev.)', 'Progresso', 'Horas', 'Instrutor(es)', 'Status'].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtradas.map((t, i) => {
                                        const b = badge(t.status);
                                        const pct = t.totalAulas > 0 ? Math.round((t.aulasDadas / t.totalAulas) * 100) : 0;
                                        return (
                                            <tr key={t.numeroTurma} className={`border-b border-gray-100 dark:border-slate-700/50 ${i % 2 ? 'bg-slate-50/40 dark:bg-slate-800/40' : ''}`}>
                                                <td className="px-3 py-2 whitespace-nowrap">{turmaCopiavel(t.numeroTurma)}</td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200 max-w-[240px] truncate" title={t.curso}>{t.curso}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{format(t.inicio, 'dd/MM/yy', { locale: ptBR })}</td>
                                                <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-800 dark:text-gray-100">{format(t.termino, 'dd/MM/yy', { locale: ptBR })}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-[11px] text-slate-500 tabular-nums">{t.aulasDadas}/{t.totalAulas}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{t.horas}h</td>
                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[200px] truncate" title={t.instrutores.join(', ')}>{t.instrutores.join(', ') || '—'}</td>
                                                <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${b.cls}`}>{b.txt}</span></td>
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
