import React, { useState, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { Aula } from '../types';

interface Props {
    onEditAula?: (aula: Aula) => void;
}

const toMinutes = (t: string): number => {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Cor por instrutor com DISTINÇÃO GARANTIDA: os matizes são distribuídos pela lista
// de instrutores usando o ângulo áureo (137,5°), que maximiza a separação entre cores
// vizinhas — dois instrutores nunca ficam com cores parecidas. Saturação/luminosidade
// fixas garantem contraste com o texto branco. Uma leve variação de luminosidade por
// paridade reforça a distinção mesmo quando a lista é grande.
const corPorIndice = (i: number): string => {
    const hue = (i * 137.508) % 360;
    const light = i % 2 === 0 ? 45 : 39;
    return `hsl(${hue.toFixed(1)}, 62%, ${light}%)`;
};

const dstr = (d: Date): string => format(d, 'yyyy-MM-dd');

// Consolida, dentro de uma célula (instrutor/dia), as aulas do MESMO curso/programa
// em um único bloco: do primeiro início ao último fim (ex.: 09:00–18:00 no mesmo dia).
// Eventos e férias não são agrupados.
const consolidarItens = (itens: Item[]): Item[] => {
    const aulas = itens.filter(i => i.tipo === 'aula');
    const outros = itens.filter(i => i.tipo !== 'aula');

    const grupos = new Map<string, Item[]>();
    for (const a of aulas) {
        const chave = `${a.programa ? 'P' : 'A'}::${a.rotulo}::${a.aula?.numeroTurma || ''}`;
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave)!.push(a);
    }

    const consolidadas: Item[] = [];
    for (const grupo of grupos.values()) {
        const ordenadas = grupo.slice().sort((x, y) => toMinutes(x.inicio) - toMinutes(y.inicio));
        const inicio = ordenadas[0].inicio;
        let fim = ordenadas[0].fim;
        for (const it of ordenadas) {
            if (toMinutes(it.fim) > toMinutes(fim)) fim = it.fim;
        }
        // mantém a referência da primeira aula (para clique → edição)
        consolidadas.push({ ...ordenadas[0], inicio, fim });
    }

    return [...consolidadas, ...outros].sort((x, y) => toMinutes(x.inicio) - toMinutes(y.inicio));
};

interface Item {
    aula?: Aula;
    inicio: string;
    fim: string;
    rotulo: string;
    tipo: 'aula' | 'evento' | 'ferias';
    programa?: boolean;
}

interface Row {
    id: string;
    nome: string;
}

export const MapaInstrutoresView: React.FC<Props> = ({ onEditAula }) => {
    const { aulas, instrutores, eventos, feriadosSet, feriados, isLoading } = useSchedule();
    const [semanaBase, setSemanaBase] = useState<Date>(new Date());
    const [busca, setBusca] = useState('');
    const [soLivres, setSoLivres] = useState(false);

    const inicioSemana = useMemo(() => startOfWeek(semanaBase, { weekStartsOn: 1 }), [semanaBase]);
    const fimSemana = useMemo(() => endOfWeek(semanaBase, { weekStartsOn: 1 }), [semanaBase]);
    const diasDaSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i)), [inicioSemana]);

    const inicioStr = dstr(inicioSemana);
    const fimStr = dstr(fimSemana);
    const hojeStr = dstr(new Date());

    // Aulas e eventos que caem dentro da semana visível
    const aulasSemana = useMemo(() => aulas.filter(a => {
        if (!(a.data instanceof Date)) return false;
        const ds = dstr(a.data);
        return ds >= inicioStr && ds <= fimStr && a.status !== 'cancelada';
    }), [aulas, inicioStr, fimStr]);

    const eventosSemana = useMemo(() => eventos.filter(e => {
        const d = e.data instanceof Date ? e.data : new Date(e.data);
        const ds = dstr(d);
        return ds >= inicioStr && ds <= fimStr && e.status !== 'cancelado';
    }), [eventos, inicioStr, fimStr]);

    // Linhas = roster de instrutores + quaisquer instrutores que aparecem nas aulas mas não estão no roster
    const rows = useMemo<Row[]>(() => {
        const base: Row[] = instrutores.map(i => ({ id: i.id, nome: i.nome }));
        const nomesConhecidos = new Set(base.map(r => r.nome));
        const idsConhecidos = new Set(base.map(r => r.id));
        aulasSemana.forEach(a => {
            const casou = (a.instrutorId && idsConhecidos.has(a.instrutorId)) || (a.instrutor && nomesConhecidos.has(a.instrutor));
            if (!casou && a.instrutor && !nomesConhecidos.has(a.instrutor)) {
                nomesConhecidos.add(a.instrutor);
                base.push({ id: '', nome: a.instrutor });
            }
        });
        return base.sort((a, b) => a.nome.localeCompare(b.nome));
    }, [instrutores, aulasSemana]);

    // Cor fixa por instrutor, distribuída pela lista completa (ordenada por nome) com
    // ângulo áureo. Baseia-se em `rows` (não no filtro), então buscar não muda as cores.
    const corPorInstrutor = useMemo(() => {
        const m = new Map<string, string>();
        rows.forEach((r, i) => {
            const k = r.id || `nome:${r.nome}`;
            m.set(k, corPorIndice(i));
        });
        return m;
    }, [rows]);

    const rowsFiltradas = useMemo(() => {
        if (!busca.trim()) return rows;
        const q = busca.toLowerCase();
        return rows.filter(r => r.nome.toLowerCase().includes(q));
    }, [rows, busca]);

    // Índice de ocupação: occ[rowKey][dateStr] = { ferias, itens[] }
    const occ = useMemo(() => {
        const idx: Record<string, Record<string, { ferias: boolean; itens: Item[] }>> = {};
        const keyOf = (r: Row) => r.id || `nome:${r.nome}`;

        for (const r of rows) {
            idx[keyOf(r)] = {};
            for (const dia of diasDaSemana) idx[keyOf(r)][dstr(dia)] = { ferias: false, itens: [] };
        }

        const pertence = (r: Row, instrutorId?: string, instrutorNome?: string) =>
            (!!r.id && instrutorId === r.id) || (!!instrutorNome && instrutorNome === r.nome);

        for (const a of aulasSemana) {
            const ds = dstr(a.data as Date);
            const r = rows.find(row => pertence(row, a.instrutorId, a.instrutor));
            if (r && idx[keyOf(r)]?.[ds]) {
                // Aulas de programa (Jovem Aprendiz) guardam o nome do programa em `origem`.
                // Para elas mostramos o programa (onde o instrutor está); para aulas normais, o curso.
                const isProg = a.tipoAula === 'PROGRAMA';
                const rotuloAula = isProg
                    ? (a.origem || a.materia || 'Programa').replace(/\s*\[\d{2}:\d{2}-\d{2}:\d{2}\]/, '').trim()
                    : (a.curso || a.materia || 'Aula');
                idx[keyOf(r)][ds].itens.push({
                    aula: a, inicio: a.horarioInicio, fim: a.horarioFim,
                    rotulo: rotuloAula, tipo: 'aula', programa: isProg
                });
            }
        }

        for (const e of eventosSemana) {
            const d = e.data instanceof Date ? e.data : new Date(e.data);
            const ds = dstr(d);
            const r = rows.find(row => pertence(row, e.instrutorId, undefined));
            if (r && idx[keyOf(r)]?.[ds]) {
                if (e.tipo === 'ferias') idx[keyOf(r)][ds].ferias = true;
                idx[keyOf(r)][ds].itens.push({
                    inicio: e.horarioInicio, fim: e.horarioFim,
                    rotulo: e.tipo === 'ferias' ? 'Férias' : (e.nome || 'Evento'),
                    tipo: e.tipo === 'ferias' ? 'ferias' : 'evento'
                });
            }
        }

        // ordena itens por horário
        for (const rk of Object.keys(idx)) {
            for (const ds of Object.keys(idx[rk])) {
                idx[rk][ds].itens.sort((x, y) => toMinutes(x.inicio) - toMinutes(y.inicio));
            }
        }
        return idx;
    }, [rows, diasDaSemana, aulasSemana, eventosSemana]);

    const keyOf = (r: Row) => r.id || `nome:${r.nome}`;

    // Se "só livres" ligado, mantém apenas instrutores com pelo menos um dia livre na semana
    const rowsVisiveis = useMemo(() => {
        if (!soLivres) return rowsFiltradas;
        return rowsFiltradas.filter(r =>
            diasDaSemana.some(dia => {
                const cel = occ[keyOf(r)]?.[dstr(dia)];
                return cel && !cel.ferias && cel.itens.length === 0;
            })
        );
    }, [rowsFiltradas, soLivres, occ, diasDaSemana]);

    const totalLivresSemana = useMemo(() => {
        let n = 0;
        for (const r of rows) for (const dia of diasDaSemana) {
            const cel = occ[keyOf(r)]?.[dstr(dia)];
            if (cel && !cel.ferias && cel.itens.length === 0) n++;
        }
        return n;
    }, [rows, diasDaSemana, occ]);

    const labelSemana = `${format(inicioSemana, 'dd/MM', { locale: ptBR })} - ${format(fimSemana, 'dd/MM/yyyy', { locale: ptBR })}`;

    return (
        <div style={{ height: 'calc(100vh - 150px)', minHeight: 560 }} className="flex flex-col gap-3">
            {/* Controles */}
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1">
                    <button onClick={() => setSemanaBase(p => subWeeks(p, 1))} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 font-black">&lt;</button>
                    <span className="font-bold text-gray-800 dark:text-gray-100 text-[11px] min-w-[160px] text-center uppercase tracking-widest">{labelSemana}</span>
                    <button onClick={() => setSemanaBase(p => addWeeks(p, 1))} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 font-black">&gt;</button>
                    <button onClick={() => setSemanaBase(new Date())} className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded-md hover:bg-blue-50 transition dark:text-blue-400 dark:border-blue-800">Hoje</button>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text" value={busca} onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar instrutor..."
                        className="text-xs border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 w-44"
                    />
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-bold text-gray-600 dark:text-gray-300">
                        <input type="checkbox" checked={soLivres} onChange={e => setSoLivres(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500" />
                        Só com dia livre
                    </label>
                </div>
            </div>

            {/* Legenda / indicadores */}
            <div className="flex items-center gap-4 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex-wrap shrink-0">
                <div className="flex items-center gap-1.5"><span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Instrutores</span><span className="text-xs font-black text-blue-600">{rows.length}</span></div>
                <span className="text-gray-200 dark:text-slate-600">|</span>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" /><span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Livre</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-gray-300 inline-block" /><span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Com aula</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block" /><span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Férias</span></div>
                <span className="text-gray-200 dark:text-slate-600">|</span>
                <div className="flex items-center gap-1.5"><span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Vagas livres na semana</span><span className="text-xs font-black text-emerald-600">{totalLivresSemana}</span></div>
                {isLoading && <span className="text-[10px] font-black text-blue-500 animate-pulse ml-auto uppercase">Carregando...</span>}
            </div>

            {/* Grade */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {rowsVisiveis.length === 0 ? (
                    <div style={{ position: 'absolute', inset: 0 }} className="flex flex-col items-center justify-center text-gray-400 gap-3">
                        <span className="text-4xl font-black opacity-20">MAPA</span>
                        <p className="text-sm font-bold uppercase tracking-widest">Nenhum instrutor para exibir</p>
                    </div>
                ) : (
                    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 1100, width: '100%' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                                <tr>
                                    <th style={{ position: 'sticky', left: 0, zIndex: 30, background: '#f9fafb', width: 190, minWidth: 190, borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Instrutor
                                    </th>
                                    {diasDaSemana.map(dia => {
                                        const ds = dstr(dia);
                                        const isHoje = ds === hojeStr;
                                        const feriado = feriadosSet.has(ds) ? (feriados.find(f => f.data === ds) || { descricao: 'Feriado' }) : null;
                                        return (
                                            <th key={ds} style={{ background: feriado ? '#fff1f2' : isHoje ? '#eff6ff' : '#f9fafb', width: 130, minWidth: 130, borderBottom: `2px solid ${feriado ? '#fca5a5' : isHoje ? '#93c5fd' : '#e5e7eb'}`, borderRight: '1px solid #e5e7eb', padding: 8, textAlign: 'center' }}>
                                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: feriado ? '#ef4444' : isHoje ? '#3b82f6' : '#9ca3af' }}>{format(dia, 'EEE', { locale: ptBR })}</p>
                                                <p style={{ fontSize: 14, fontWeight: 700, color: feriado ? '#dc2626' : isHoje ? '#1d4ed8' : '#374151' }}>{format(dia, 'dd/MM')}</p>
                                                {feriado && <p style={{ fontSize: 8, color: '#ef4444', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 116 }}>🎉 {feriado.descricao}</p>}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {rowsVisiveis.map((r, rowIdx) => {
                                    const corInstrutor = corPorInstrutor.get(keyOf(r)) || '#334155';
                                    return (
                                    <tr key={keyOf(r)} style={{ background: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                        <td style={{ position: 'sticky', left: 0, zIndex: 10, background: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb', width: 190, minWidth: 190, borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', padding: '10px 12px', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: corInstrutor, flexShrink: 0 }} />
                                                <span style={{ fontWeight: 800, fontSize: 12, color: '#374151', lineHeight: 1.3 }}>{r.nome}</span>
                                            </div>
                                        </td>
                                        {diasDaSemana.map(dia => {
                                            const ds = dstr(dia);
                                            const cel = occ[keyOf(r)]?.[ds] || { ferias: false, itens: [] };
                                            const isHoje = ds === hojeStr;
                                            const feriado = feriadosSet.has(ds);
                                            const livre = !cel.ferias && cel.itens.length === 0 && !feriado;
                                            return (
                                                <td key={ds} style={{
                                                    verticalAlign: 'top', padding: 6, minHeight: 56,
                                                    borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', width: 130, minWidth: 130,
                                                    background: cel.ferias ? 'rgba(254,226,226,0.5)' : livre ? 'rgba(209,250,229,0.45)' : isHoje ? 'rgba(239,246,255,0.4)' : 'transparent'
                                                }}>
                                                    {feriado && cel.itens.length === 0 && !cel.ferias ? (
                                                        <span style={{ color: '#f87171', fontSize: 9, fontWeight: 700 }}>Feriado</span>
                                                    ) : livre ? (
                                                        <span style={{ color: '#10b981', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Livre</span>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {consolidarItens(cel.itens).map((it, i) => {
                                                                const clickable = it.tipo === 'aula' && it.aula && onEditAula;
                                                                // Aulas (normais e de programa) usam a cor fixa do instrutor; férias/eventos mantêm cor própria.
                                                                const bg = it.tipo === 'ferias' ? '#fecaca' : it.tipo === 'evento' ? '#e0e7ff' : corInstrutor;
                                                                const fg = it.tipo === 'ferias' ? '#991b1b' : it.tipo === 'evento' ? '#3730a3' : '#ffffff';
                                                                return (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => clickable && onEditAula!(it.aula!)}
                                                                        title={`${it.inicio}-${it.fim} ${it.rotulo}${it.tipo === 'aula' && it.aula?.numeroTurma ? ' • Turma ' + it.aula.numeroTurma : ''}`}
                                                                        style={{ textAlign: 'left', border: 'none', borderLeft: it.programa ? '3px solid #fbbf24' : 'none', borderRadius: 5, padding: '3px 6px', background: bg, color: fg, cursor: clickable ? 'pointer' : 'default', width: '100%' }}
                                                                    >
                                                                        <span style={{ display: 'block', fontSize: 10, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                                                            {it.tipo === 'ferias' ? 'Férias' : `${it.inicio}-${it.fim}`}
                                                                        </span>
                                                                        {it.tipo !== 'ferias' && (
                                                                            <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 116 }}>{it.rotulo}</span>
                                                                        )}
                                                                        {it.tipo === 'aula' && it.aula?.numeroTurma && (
                                                                            <span style={{ display: 'block', fontSize: 8.5, fontWeight: 700, opacity: 0.9, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 116 }}>#{it.aula.numeroTurma}</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapaInstrutoresView;
