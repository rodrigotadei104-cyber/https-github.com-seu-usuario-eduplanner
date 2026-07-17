import React, { useState, useMemo, useEffect } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { format } from 'date-fns';
import { Aula, Evento, Instrutor } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const toMinutes = (hhmm: string): number => {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

const sameLocalDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

interface Ocupacao {
    inicio: string;
    fim: string;
    rotulo: string;
    tipo: 'aula' | 'evento' | 'ferias';
}

interface LinhaInstrutor {
    instrutor: Instrutor;
    ocupadoNaFaixa: boolean;
    deFerias: boolean;
    ocupacoesNoDia: Ocupacao[];
}

export const DisponibilidadeInstrutorModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const { aulas, instrutores, eventos, currentDate } = useSchedule();

    const [dataStr, setDataStr] = useState(format(currentDate, 'yyyy-MM-dd'));
    const [diaInteiro, setDiaInteiro] = useState(true);
    const [inicio, setInicio] = useState('08:00');
    const [fim, setFim] = useState('12:00');

    // Sempre que abrir, sincroniza a data com o dia que o usuário está vendo na agenda
    useEffect(() => {
        if (isOpen) setDataStr(format(currentDate, 'yyyy-MM-dd'));
    }, [isOpen, currentDate]);

    const dataSelecionada = useMemo(() => {
        const [y, m, d] = dataStr.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }, [dataStr]);

    const faixaInicio = diaInteiro ? 0 : toMinutes(inicio);
    const faixaFim = diaInteiro ? 24 * 60 : toMinutes(fim);
    const faixaValida = faixaFim > faixaInicio;

    const linhas = useMemo<LinhaInstrutor[]>(() => {
        const pertence = (instrutorId: string | undefined, instrutorNome: string | undefined, inst: Instrutor) =>
            (instrutorId && instrutorId === inst.id) || (!!instrutorNome && instrutorNome === inst.nome);

        // Aulas e eventos do dia selecionado (excluindo canceladas/cancelados)
        const aulasDoDia = aulas.filter(a =>
            a.data instanceof Date && sameLocalDay(a.data, dataSelecionada) && a.status !== 'cancelada'
        );
        const eventosDoDia = eventos.filter(e => {
            const d = e.data instanceof Date ? e.data : new Date(e.data);
            return sameLocalDay(d, dataSelecionada) && e.status !== 'cancelado';
        });

        return instrutores
            .slice()
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(inst => {
                const ocupacoes: Ocupacao[] = [];

                aulasDoDia
                    .filter((a: Aula) => pertence(a.instrutorId, a.instrutor, inst))
                    .forEach((a: Aula) => ocupacoes.push({
                        inicio: a.horarioInicio, fim: a.horarioFim,
                        rotulo: a.materia || a.curso || 'Aula', tipo: 'aula'
                    }));

                let deFerias = false;
                eventosDoDia
                    .filter((e: Evento) => pertence(e.instrutorId, undefined, inst))
                    .forEach((e: Evento) => {
                        if (e.tipo === 'ferias') deFerias = true;
                        ocupacoes.push({
                            inicio: e.horarioInicio, fim: e.horarioFim,
                            rotulo: e.tipo === 'ferias' ? 'Férias' : (e.nome || 'Evento'),
                            tipo: e.tipo === 'ferias' ? 'ferias' : 'evento'
                        });
                    });

                ocupacoes.sort((x, y) => toMinutes(x.inicio) - toMinutes(y.inicio));

                // Ocupado na faixa: férias (dia todo) OU alguma ocupação sobrepondo [faixaInicio, faixaFim)
                const ocupadoNaFaixa = deFerias || ocupacoes.some(o =>
                    o.tipo !== 'ferias' && toMinutes(o.inicio) < faixaFim && toMinutes(o.fim) > faixaInicio
                );

                return { instrutor: inst, ocupadoNaFaixa, deFerias, ocupacoesNoDia: ocupacoes };
            });
    }, [aulas, eventos, instrutores, dataSelecionada, faixaInicio, faixaFim]);

    const livres = linhas.filter(l => !l.ocupadoNaFaixa);
    const ocupados = linhas.filter(l => l.ocupadoNaFaixa);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20">
                    <div className="flex items-center gap-3">
                        <div className="px-2 py-1 bg-emerald-600 text-white text-[10px] font-black rounded uppercase tracking-widest">Disponibilidade</div>
                        <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tighter">Quem está livre?</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-black dark:hover:text-white font-black text-xs uppercase tracking-widest">Fechar</button>
                </div>

                {/* Filtros */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Dia</label>
                            <input
                                type="date" value={dataStr}
                                onChange={e => setDataStr(e.target.value)}
                                className="rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            />
                        </div>
                        <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                            <input type="checkbox" checked={diaInteiro} onChange={e => setDiaInteiro(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Dia inteiro</span>
                        </label>
                        {!diaInteiro && (
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Das</label>
                                    <input type="time" value={inicio} onChange={e => setInicio(e.target.value)} className="rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Até</label>
                                    <input type="time" value={fim} onChange={e => setFim(e.target.value)} className="rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-2 text-sm" />
                                </div>
                            </div>
                        )}
                    </div>
                    {!faixaValida && <p className="text-xs text-rose-600 font-bold">O horário final deve ser maior que o inicial.</p>}
                </div>

                {/* Resultado */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 custom-scrollbar">
                    {/* Livres */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <h4 className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Livres ({livres.length})</h4>
                        </div>
                        {livres.length === 0 ? (
                            <p className="text-sm text-gray-400">Ninguém livre nesse período.</p>
                        ) : (
                            <div className="space-y-2">
                                {livres.map(l => (
                                    <div key={l.instrutor.id} className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/40 rounded-lg">
                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{l.instrutor.nome}</span>
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Livre</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Ocupados */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            <h4 className="text-[11px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">Ocupados ({ocupados.length})</h4>
                        </div>
                        {ocupados.length === 0 ? (
                            <p className="text-sm text-gray-400">Ninguém ocupado nesse período.</p>
                        ) : (
                            <div className="space-y-2">
                                {ocupados.map(l => (
                                    <div key={l.instrutor.id} className="px-3 py-2 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/40 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{l.instrutor.nome}</span>
                                            {l.deFerias && <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Férias</span>}
                                        </div>
                                        {l.ocupacoesNoDia.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {l.ocupacoesNoDia.map((o, i) => (
                                                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${o.tipo === 'ferias' ? 'bg-rose-200 text-rose-800 dark:bg-rose-800/40 dark:text-rose-200' : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600'}`}>
                                                        {o.tipo === 'ferias' ? 'Férias (dia todo)' : `${o.inicio}–${o.fim} ${o.rotulo}`}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Rodapé resumo */}
                <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                        {format(dataSelecionada, 'dd/MM/yyyy')} · {diaInteiro ? 'dia inteiro' : `${inicio}–${fim}`} · {instrutores.length} instrutor(es)
                    </span>
                    <button onClick={onClose} className="px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition">Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default DisponibilidadeInstrutorModal;
