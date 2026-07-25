import React, { useState, useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { Aula } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Check } from 'lucide-react';

const toMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const r1 = (n: number) => Math.round(n * 10) / 10;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Cada corte é um ciclo MENSAL próprio, terminando na sua data:
//  - corte 5  -> 06 do mês anterior até 05 do mês atual
//  - corte 25 -> 26 do mês anterior até 25 do mês atual
const janelaPeriodo = (ano: number, mes: number, corte: 5 | 25) => {
    if (corte === 5) return { ini: new Date(ano, mes - 1, 6), fim: new Date(ano, mes, 5) };
    return { ini: new Date(ano, mes - 1, 26), fim: new Date(ano, mes, 25) };
};

interface CompConcluido {
    numeroTurma: string;
    curso: string;
    componente: string;
    dataConclusao: Date;
    horas: number;
    instrutores: string[];
}

export const FechamentoView: React.FC = () => {
    const { aulas } = useSchedule();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const [corte, setCorte] = useState<5 | 25>(hoje.getDate() <= 15 ? 5 : 25);
    const [busca, setBusca] = useState('');
    // "Conferido" por turma — auxílio visual na conferência do faturamento.
    // Só na sessão: reseta ao recarregar a página (sem persistência).
    const [conferidas, setConferidas] = useState<Set<string>>(new Set());
    const toggleConferida = (nt: string) => setConferidas(prev => {
        const n = new Set(prev);
        if (n.has(nt)) n.delete(nt); else n.add(nt);
        return n;
    });
    // "Conferido" por componente (linha da tabela de detalhe), chave turma||componente.
    const [compConferidos, setCompConferidos] = useState<Set<string>>(new Set());
    const toggleComp = (chave: string) => setCompConferidos(prev => {
        const n = new Set(prev);
        if (n.has(chave)) n.delete(chave); else n.add(chave);
        return n;
    });

    // Clique no nº da turma copia direto pra área de transferência (sem selecionar).
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
            title="Clique para copiar o Nº da turma"
            className="group inline-flex items-center gap-1 font-mono font-bold text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer">
            <span>{nt}</span>
            {copiado === nt
                ? <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-600 uppercase tracking-wide"><Check className="w-3 h-3" />copiado</span>
                : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
        </button>
    );

    const dados = useMemo(() => {
        const { ini, fim } = janelaPeriodo(ano, mes, corte);
        const iniMs = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime();
        const fimMs = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();

        // Agrupa por turma + componente (matéria)
        const grupos = new Map<string, { numeroTurma: string; curso: string; componente: string; datas: number[]; horas: number; instrutores: Set<string> }>();
        // Última aula da turma inteira (para saber se a TURMA encerrou no período)
        const ultimaTurma = new Map<string, number>();

        (aulas as Aula[]).forEach(a => {
            if (!(a.data instanceof Date) || a.status === 'cancelada') return;
            const nt = a.numeroTurma || a.numeroCurso;
            if (!nt) return;
            const dMs = new Date(a.data.getFullYear(), a.data.getMonth(), a.data.getDate()).getTime();
            ultimaTurma.set(nt, Math.max(ultimaTurma.get(nt) || 0, dMs));

            const comp = a.materia || '—';
            const key = `${nt}||${comp}`;
            if (!grupos.has(key)) grupos.set(key, { numeroTurma: nt, curso: a.curso || '—', componente: comp, datas: [], horas: 0, instrutores: new Set() });
            const g = grupos.get(key)!;
            g.datas.push(dMs);
            g.horas += Math.max(0, (toMin(a.horarioFim) - toMin(a.horarioInicio)) / 60);
            if (a.instrutor) g.instrutores.add(a.instrutor);
        });

        const componentes: CompConcluido[] = [];
        for (const g of grupos.values()) {
            const ultima = Math.max(...g.datas);
            if (ultima >= iniMs && ultima <= fimMs) {
                componentes.push({
                    numeroTurma: g.numeroTurma, curso: g.curso, componente: g.componente,
                    dataConclusao: new Date(ultima), horas: r1(g.horas), instrutores: Array.from(g.instrutores)
                });
            }
        }
        componentes.sort((a, b) => a.dataConclusao.getTime() - b.dataConclusao.getTime() || a.curso.localeCompare(b.curso));

        return { ini, fim, iniMs, fimMs, ultimaTurma, componentes };
    }, [aulas, ano, mes, corte]);

    // Busca aplicada a TUDO: filtra os componentes e o resumo/indicadores derivam daqui.
    const compFiltrados = useMemo(() => {
        if (!busca.trim()) return dados.componentes;
        const q = busca.toLowerCase();
        return dados.componentes.filter(c => c.numeroTurma.toLowerCase().includes(q) || c.curso.toLowerCase().includes(q) || c.componente.toLowerCase().includes(q) || c.instrutores.some(i => i.toLowerCase().includes(q)));
    }, [dados.componentes, busca]);

    const resumo = useMemo(() => {
        const porTurma = new Map<string, { numeroTurma: string; curso: string; qtd: number; horas: number; encerrada: boolean }>();
        compFiltrados.forEach(c => {
            if (!porTurma.has(c.numeroTurma)) {
                const ult = dados.ultimaTurma.get(c.numeroTurma) || 0;
                porTurma.set(c.numeroTurma, { numeroTurma: c.numeroTurma, curso: c.curso, qtd: 0, horas: 0, encerrada: ult >= dados.iniMs && ult <= dados.fimMs });
            }
            const t = porTurma.get(c.numeroTurma)!;
            t.qtd++; t.horas = r1(t.horas + c.horas);
        });
        return Array.from(porTurma.values()).sort((a, b) => a.curso.localeCompare(b.curso));
    }, [compFiltrados, dados]);

    const totalHoras = useMemo(() => r1(compFiltrados.reduce((s, c) => s + c.horas, 0)), [compFiltrados]);

    // Anos dinâmicos: cobre todos os anos presentes nas aulas + folga pra frente (cursos futuros).
    const anos = useMemo(() => {
        let min = hoje.getFullYear(), max = hoje.getFullYear();
        (aulas as Aula[]).forEach(a => {
            if (a.data instanceof Date) { const y = a.data.getFullYear(); if (y < min) min = y; if (y > max) max = y; }
        });
        min = Math.min(min, hoje.getFullYear() - 1);
        max = Math.max(max, hoje.getFullYear() + 1) + 1;
        const arr: number[] = [];
        for (let y = min; y <= max; y++) arr.push(y);
        return arr;
    }, [aulas]);

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <h1 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tighter border-b-2 border-indigo-600 inline-block">Fechamento (5 / 25)</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Componentes e cursos concluídos no período do corte (pela data da última aula).</p>
            </div>

            {/* Controles */}
            <div className="px-6 py-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex flex-wrap items-center gap-3">
                <select value={mes} onChange={e => setMes(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-900 dark:text-white">
                    {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select value={ano} onChange={e => setAno(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-2 bg-white dark:bg-slate-900 dark:text-white">
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
                    {([5, 25] as const).map(c => (
                        <button key={c} onClick={() => setCorte(c)} className={`px-4 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wide transition ${corte === c ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>Corte dia {c}</button>
                    ))}
                </div>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg">
                    Período: {format(dados.ini, 'dd/MM/yy', { locale: ptBR })} → {format(dados.fim, 'dd/MM/yy', { locale: ptBR })}
                </span>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar turma, curso, componente..."
                    className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-white ml-auto w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar space-y-6">
                {/* Indicadores */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 text-center"><p className="text-2xl font-black text-indigo-600">{compFiltrados.length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Componentes concluídos</p></div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 text-center"><p className="text-2xl font-black text-emerald-600">{resumo.filter(r => r.encerrada).length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Turmas encerradas</p></div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 text-center"><p className="text-2xl font-black text-slate-700 dark:text-slate-200">{totalHoras}h</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Horas concluídas</p></div>
                </div>

                {/* Resumo por curso/turma */}
                <div>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        Resumo por curso/turma ({resumo.length})
                        {(() => { const n = resumo.filter(r => conferidas.has(r.numeroTurma)).length; return n > 0 ? <span className="text-emerald-600 dark:text-emerald-400 normal-case"> — {n} conferida{n !== 1 ? 's' : ''}</span> : null; })()}
                    </h3>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: 600 }}>
                            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500"><tr>
                                <th className="px-3 py-2 text-center font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700 w-16">Conf.</th>
                                {['Turma', 'Curso', 'Componentes concl.', 'Horas', 'Turma encerrada?'].map(h => <th key={h} className="px-3 py-2 text-left font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700">{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {resumo.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Nenhuma conclusão neste período.</td></tr> :
                                    resumo.map((t, i) => {
                                        const conf = conferidas.has(t.numeroTurma);
                                        return (
                                        <tr key={t.numeroTurma} className={`border-b border-gray-100 dark:border-slate-700/50 transition-colors ${conf ? 'bg-emerald-50/70 dark:bg-emerald-900/15' : i % 2 ? 'bg-slate-50/40 dark:bg-slate-800/40' : ''}`}>
                                            <td className="px-3 py-2 text-center">
                                                <input type="checkbox" checked={conf} onChange={() => toggleConferida(t.numeroTurma)}
                                                    title={conf ? 'Conferido — clique para desmarcar' : 'Marcar como conferido'}
                                                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer align-middle" />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{turmaCopiavel(t.numeroTurma)}</td>
                                            <td className="px-3 py-2 max-w-[280px] truncate" title={t.curso}>{t.curso}</td>
                                            <td className="px-3 py-2 text-center font-bold">{t.qtd}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{t.horas}h</td>
                                            <td className="px-3 py-2">{t.encerrada ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Sim</span> : <span className="text-slate-400 text-xs">—</span>}</td>
                                        </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Componentes concluídos (detalhe) */}
                <div>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        Componentes concluídos no período ({compFiltrados.length})
                        {(() => { const n = compFiltrados.filter(c => compConferidos.has(`${c.numeroTurma}||${c.componente}`)).length; return n > 0 ? <span className="text-emerald-600 dark:text-emerald-400 normal-case"> — {n} conferido{n !== 1 ? 's' : ''}</span> : null; })()}
                    </h3>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: 800 }}>
                            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500"><tr>
                                <th className="px-3 py-2 text-center font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700 w-16">Conf.</th>
                                {['Turma', 'Curso', 'Componente', 'Concluído em', 'Horas', 'Instrutor(es)'].map(h => <th key={h} className="px-3 py-2 text-left font-black uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-slate-700">{h}</th>)}
                            </tr></thead>
                            <tbody>
                                {compFiltrados.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Nenhum componente concluído neste período.</td></tr> :
                                    compFiltrados.map((c, i) => {
                                        const chave = `${c.numeroTurma}||${c.componente}`;
                                        const conf = compConferidos.has(chave);
                                        return (
                                        <tr key={i} className={`border-b border-gray-100 dark:border-slate-700/50 transition-colors ${conf ? 'bg-emerald-50/70 dark:bg-emerald-900/15' : i % 2 ? 'bg-slate-50/40 dark:bg-slate-800/40' : ''}`}>
                                            <td className="px-3 py-2 text-center">
                                                <input type="checkbox" checked={conf} onChange={() => toggleComp(chave)}
                                                    title={conf ? 'Conferido — clique para desmarcar' : 'Marcar como conferido'}
                                                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer align-middle" />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{turmaCopiavel(c.numeroTurma)}</td>
                                            <td className="px-3 py-2 max-w-[200px] truncate" title={c.curso}>{c.curso}</td>
                                            <td className="px-3 py-2 max-w-[240px] truncate" title={c.componente}>{c.componente}</td>
                                            <td className="px-3 py-2 whitespace-nowrap font-semibold">{format(c.dataConclusao, 'dd/MM/yy', { locale: ptBR })}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{c.horas}h</td>
                                            <td className="px-3 py-2 max-w-[180px] truncate" title={c.instrutores.join(', ')}>{c.instrutores.join(', ') || '—'}</td>
                                        </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FechamentoView;
