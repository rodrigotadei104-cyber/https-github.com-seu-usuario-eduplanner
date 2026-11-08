import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useSchedule } from '../context/ScheduleContext';
import { canChangeTurmaLesson, localDateKey } from '../utils/turmaChanges';
import { selectTurmaReschedule, shiftDateKey, turmaDateChanges } from '../utils/turmaReschedule';
import { turmaRescheduleService } from '../services/turmaReschedule.service';
import type { TurmaReschedulePreview } from '../services/turmaReschedule.service';
import type { Aula } from '../types';

interface Props {
    isOpen: boolean; onClose: () => void; onApplied: () => Promise<void>;
    turma: { numeroTurma: string; curso: string; aulas: Aula[] };
}
const dateLabel = (key: string) => key.split('-').reverse().join('/');
const inputClass = 'rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const secondary = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-600';
export const TurmaRescheduleModal: React.FC<Props> = ({ isOpen, onClose, onApplied, turma }) => {
    const { userProfile } = useSchedule();
    const dialog = useRef<HTMLDialogElement>(null), applying = useRef(false);
    const [dates, setDates] = useState<Record<string, string>>({});
    const [excluded, setExcluded] = useState<string[]>([]);
    const [offset, setOffset] = useState('7');
    const [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [preview, setPreview] = useState<TurmaReschedulePreview | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [saved, setSaved] = useState<number | null>(null);
    const now = useMemo(() => new Date(), [isOpen]);
    const allowed = ['admin', 'editor'].includes(userProfile.role);
    useEffect(() => {
        const element = dialog.current;
        if (isOpen) {
            setDates({}); setExcluded([]); setPreview(null); setSaved(null); setError('');
            setFrom(''); setTo(''); setOffset('7'); applying.current = false;
            if (!element?.open) element?.showModal();
        } else element?.close();
        return () => element?.close();
    }, [isOpen]);
    const eligible = turma.aulas.filter(a => canChangeTurmaLesson(a, now));
    const originalDates = [...new Set(eligible.map(a => localDateKey(a.data)))].sort();
    const selected = selectTurmaReschedule(turma.aulas, dates, excluded, now);
    const candidates = eligible.filter(a => Object.hasOwn(dates, localDateKey(a.data)));
    const previewRows = preview ? [...preview.snapshot].sort((a, b) => a.data.localeCompare(b.data) || a.horario_inicio.localeCompare(b.horario_inicio)) : [];
    let validation = '', changes: ReturnType<typeof turmaDateChanges> = [];
    try { changes = turmaDateChanges(selected, dates, now); }
    catch (err) { validation = err instanceof Error ? err.message : 'Revise as novas datas.'; }
    const changeDate = (key: string, value?: string) => {
        setError(''); setDates(previous => {
            const next = { ...previous }; if (value === undefined) delete next[key]; else next[key] = value; return next;
        });
    };
    const selectDates = (keys: string[]) => { setError(''); setDates(previous => Object.fromEntries(keys.map(d => [d, previous[d] || '']))); };
    const review = async () => {
        if (busy || !allowed || validation || !changes.length || changes.length > 500) return;
        setBusy(true); setError('');
        try { setPreview(await turmaRescheduleService.preview(selected, changes)); }
        catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível gerar a prévia.'); }
        finally { setBusy(false); }
    };
    const confirm = async () => {
        if (!preview || preview.conflicts.length || busy || applying.current || !allowed) return;
        applying.current = true; setBusy(true); setError('');
        try {
            const result = await turmaRescheduleService.apply(preview); setSaved(result.changedCount);
            try { await onApplied(); } catch { setError('Reagendamento salvo. Atualize a página para recarregar a agenda.'); }
        } catch (err) { setPreview(null); setError(err instanceof Error ? err.message : 'Não foi possível confirmar o reagendamento.'); }
        finally { applying.current = false; setBusy(false); }
    };
    return <dialog ref={dialog} aria-labelledby="reschedule-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
        className="m-auto max-h-[92vh] w-[min(1000px,95vw)] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/55 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex max-h-[92vh] flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-700">
                <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">Turma {turma.numeroTurma}</p>
                    <h2 id="reschedule-title" className="mt-1 text-xl font-bold">Reagendar aulas</h2><p className="mt-1 text-sm text-slate-500">{turma.curso}</p></div>
                <button type="button" onClick={onClose} disabled={busy} className={secondary}>Fechar</button>
            </header>
            <div className="overflow-y-auto px-6 py-5">
                {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
                {!allowed ? <p>Você não tem permissão para reagendar aulas.</p> : saved !== null ?
                    <div role="status" className="rounded-xl bg-teal-50 p-6 dark:bg-teal-950"><h3 className="text-lg font-bold">{saved} aulas reagendadas</h3><p className="mt-2 text-sm">Disciplinas, horários, salas, instrutores e carga horária foram mantidos.</p></div>
                    : !preview ? <>
                        <p className="mb-4 text-sm text-slate-500">Selecione os dias e escolha as novas datas. Depois, revise a prévia antes de confirmar.</p>
                        {eligible.length === 0 ? <p>Não há aulas futuras agendadas disponíveis para reagendamento.</p> : <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
                            <legend className="sr-only">Escolher aulas e novas datas</legend>
                            <section aria-label="Seleção de datas">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Dias que serão reagendados</h3><div className="flex gap-3 text-sm"><button type="button" onClick={() => selectDates(originalDates)} className="text-teal-700 dark:text-teal-300">Selecionar todos</button><button type="button" onClick={() => selectDates([])}>Limpar</button></div></div>
                                <div className="mb-3 flex flex-wrap items-end gap-2"><label className="text-xs">De<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputClass} mt-1 block`} /></label><label className="text-xs">Até<input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inputClass} mt-1 block`} /></label>
                                    <button type="button" className={secondary} disabled={!from || !to || from > to} onClick={() => selectDates(originalDates.filter(d => d >= from && d <= to))}>Selecionar período</button></div>
                                <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Selecionar / data atual</th><th className="p-3">Nova data</th></tr></thead><tbody>
                                    {originalDates.map(d => <tr key={d} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={Object.hasOwn(dates, d)} onChange={e => changeDate(d, e.target.checked ? '' : undefined)} />{dateLabel(d)}</label></td><td className="p-3"><input type="date" aria-label={`Nova data para ${dateLabel(d)}`} className={inputClass} disabled={!Object.hasOwn(dates, d)} value={dates[d] || ''} onChange={e => changeDate(d, e.target.value)} /></td></tr>)}
                                </tbody></table></div>
                                <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs">Deslocamento em dias<input type="number" min={-3660} max={3660} step={1} value={offset} onChange={e => setOffset(e.target.value)} className={`${inputClass} mt-1 block w-28`} /></label>
                                    <button type="button" className={secondary} disabled={!Object.keys(dates).length || !offset.trim() || !Number.isInteger(Number(offset)) || Math.abs(Number(offset)) > 3660 || Number(offset) === 0}
                                        onClick={() => setDates(previous => Object.fromEntries(Object.keys(previous).map(d => [d, shiftDateKey(d, Number(offset))])))}>Preencher novas datas</button></div>
                                <p className="mt-2 text-xs text-slate-500">Exemplo: 7 adia uma semana; -7 antecipa uma semana. O cálculo parte das datas originais. Feriados e bloqueios serão conferidos na prévia.</p>
                            </section>
                            {candidates.length > 0 && <section><h3 className="mb-2 font-bold">Aulas selecionadas</h3><p className="mb-2 text-xs text-slate-500">Desmarque as disciplinas que devem permanecer na data original.</p><div className="max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="p-2">Reagendar</th><th className="p-2">Data / horário</th><th className="p-2">Disciplina</th><th className="p-2">Instrutor / sala</th></tr></thead><tbody>{candidates.map(a => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2"><input type="checkbox" aria-label={`Reagendar ${a.materia} em ${format(a.data, 'dd/MM/yyyy')} às ${a.horarioInicio.slice(0, 5)}`} checked={!excluded.includes(a.id)} onChange={e => setExcluded(previous => e.target.checked ? previous.filter(id => id !== a.id) : [...previous, a.id])} /></td><td className="whitespace-nowrap p-2">{format(a.data, 'dd/MM/yyyy')}<br />{a.horarioInicio.slice(0, 5)}–{a.horarioFim.slice(0, 5)}</td><td className="p-2">{a.materia}</td><td className="p-2">{a.instrutor || 'Sem instrutor'}<br />{a.sala || 'Sem sala'}</td></tr>)}</tbody></table></div></section>}
                        </fieldset>}
                        <p role="status" className="mt-4 text-sm font-semibold">{selected.length} aulas selecionadas.</p>
                        {selected.length > 500 && <p className="mt-2 text-sm text-rose-700">Selecione até 500 aulas por operação.</p>}
                        {selected.length > 0 && validation && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{validation}</p>}
                        <p className="mt-2 text-xs text-slate-500">Apenas aulas futuras agendadas. As disciplinas desmarcadas e as demais aulas mantêm suas datas.</p>
                    </> : <>
                        <h3 className="text-lg font-bold">Revisar {preview.changedCount} aulas</h3><p className="mt-1 text-sm text-slate-500">Confira cada nova data. Horários, instrutores, salas e carga horária serão mantidos.</p>
                        <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Antes</th><th className="p-3">Depois</th><th className="p-3">Horário</th><th className="p-3">Disciplina</th></tr></thead><tbody>{previewRows.map(a => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="whitespace-nowrap p-3">{dateLabel(a.data)}</td><td className="whitespace-nowrap p-3 font-bold text-teal-700 dark:text-teal-300">{dateLabel(a.nova_data)}</td><td className="whitespace-nowrap p-3">{a.horario_inicio}–{a.horario_fim}</td><td className="p-3">{turma.aulas.find(row => row.id === a.id)?.materia || 'Disciplina'}</td></tr>)}</tbody></table></div>
                        {preview.conflicts.length ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100"><p className="font-bold">Há conflitos. Nenhuma aula foi reagendada.</p><ul className="mt-2 space-y-1">{preview.conflicts.map(c => <li key={`${c.id}:${c.data}:${c.descricao}`}>{dateLabel(c.data)} · {c.inicio.slice(0, 5)}–{c.fim.slice(0, 5)} · {c.descricao}</li>)}</ul><p className="mt-2">Volte à seleção para escolher outras datas ou retirar aulas.</p></div>
                            : <p role="status" className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100">Nenhum conflito encontrado. A agenda será conferida novamente ao confirmar.</p>}
                    </>}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                {saved !== null ? <button type="button" className={`${secondary} ml-auto`} onClick={onClose} disabled={busy}>Voltar à agenda</button> : <>
                    <button type="button" className={secondary} disabled={busy} onClick={() => preview ? setPreview(null) : onClose()}>{preview ? 'Voltar à seleção' : 'Cancelar'}</button>
                    <button type="button" className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !allowed || (!preview && (!selected.length || !!validation || selected.length > 500)) || !!preview?.conflicts.length} onClick={preview ? confirm : review}>{busy ? 'Conferindo…' : preview ? `Confirmar reagendamento de ${preview.changedCount} aulas` : 'Revisar reagendamento'}</button>
                </>}
            </footer>
        </div>
    </dialog>;
};
