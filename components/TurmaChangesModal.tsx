import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useSchedule } from '../context/ScheduleContext';
import { SalaSelect } from './SalaSelect';
import { turmaChangesService } from '../services/turmaChanges.service';
import type { TurmaChangePreview } from '../services/turmaChanges.service';
import { canChangeTurmaLesson, localDateKey, selectTurmaChanges, turmaResource } from '../utils/turmaChanges';
import type { TurmaChangeKind } from '../utils/turmaChanges';
import type { Aula } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onApplied: () => Promise<void>;
    turma: { numeroTurma: string; curso: string; aulas: Aula[] };
}
const shortDate = (value: string) => value.split('-').reverse().join('/');
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

export const TurmaChangesModal: React.FC<Props> = ({ isOpen, onClose, onApplied, turma }) => {
    const { instrutores, userProfile } = useSchedule();
    const dialog = useRef<HTMLDialogElement>(null);
    const applying = useRef(false);
    const [kind, setKind] = useState<TurmaChangeKind>('instrutor');
    const [source, setSource] = useState('__unset__');
    const [target, setTarget] = useState('');
    const [dates, setDates] = useState<string[]>([]);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [preview, setPreview] = useState<TurmaChangePreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [savedCount, setSavedCount] = useState<number | null>(null);
    const now = useMemo(() => new Date(), [isOpen]);
    const allowed = ['admin', 'editor'].includes(userProfile.role);
    useEffect(() => {
        const element = dialog.current;
        if (isOpen) {
            setKind('instrutor'); setSource('__unset__'); setTarget(''); setDates([]); setExcluded([]);
            setPreview(null); setError(''); setSavedCount(null); setFrom(''); setTo(''); applying.current = false;
            if (!element?.open) element?.showModal();
        } else element?.close();
        return () => element?.close();
    }, [isOpen]);
    const eligible = useMemo(() => turma.aulas.filter(a => canChangeTurmaLesson(a, now)), [turma.aulas, now]);
    const origins = useMemo(() => [...new Set(eligible.map(a => turmaResource(a, kind)))], [eligible, kind]);
    const effectiveSource = source === '__unset__' && origins.length === 1 ? origins[0] : source;
    const resourceLabel = (value: string | null) => kind === 'sala' ? value || 'Sem sala'
        : instrutores.find(i => i.id === value)?.nome || (value ? 'Instrutor não encontrado' : 'Sem instrutor');
    const matching = eligible.filter(a => (effectiveSource === '__all__' || turmaResource(a, kind) === effectiveSource)
        && turmaResource(a, kind) !== target.trim());
    const availableDates = [...new Set(matching.map(a => localDateKey(a.data)))].sort();
    const candidates = matching.filter(a => dates.includes(localDateKey(a.data)));
    const selected = selectTurmaChanges(turma.aulas, kind, effectiveSource, target.trim(), dates, excluded, now);
    const invalidate = () => { setPreview(null); setError(''); setExcluded([]); };
    const showPreview = async () => {
        if (busy || !allowed || !target.trim() || selected.length === 0 || selected.length > 500) return;
        setBusy(true); setError('');
        try { setPreview(await turmaChangesService.preview(selected, kind, target)); }
        catch (err: unknown) { setError(err instanceof Error ? err.message : 'Não foi possível gerar a prévia.'); }
        finally { setBusy(false); }
    };
    const apply = async () => {
        if (!preview || preview.conflicts.length || busy || applying.current || !allowed) return;
        applying.current = true; setBusy(true); setError('');
        try {
            const result = await turmaChangesService.apply(preview, kind, target);
            setSavedCount(result.changedCount);
            try { await onApplied(); }
            catch { setError('Alterações salvas. Atualize a página para recarregar a agenda.'); }
        } catch (err: unknown) {
            setPreview(null);
            setError(err instanceof Error ? err.message : 'Não foi possível confirmar a alteração. Atualize a agenda.');
        } finally { applying.current = false; setBusy(false); }
    };
    const changeKind = (value: TurmaChangeKind) => {
        invalidate(); setKind(value); setSource('__unset__'); setTarget(''); setDates([]);
    };
    return <dialog ref={dialog} aria-labelledby="turma-change-title"
        onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
        className="m-auto w-[min(960px,95vw)] max-h-[92vh] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/55 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex max-h-[92vh] flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-700">
                <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">Turma {turma.numeroTurma}</p>
                    <h2 id="turma-change-title" className="mt-1 text-xl font-bold">Alterar instrutor ou sala</h2>
                    <p className="mt-1 text-sm text-slate-500">{turma.curso}</p></div>
                <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">Fechar</button>
            </header>
            <div className="overflow-y-auto px-6 py-5">
                {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
                {!allowed ? <p>Você não tem permissão para alterar aulas.</p> : savedCount !== null ?
                    <div role="status" className="rounded-xl bg-teal-50 p-6 dark:bg-teal-950"><h3 className="text-lg font-bold">{savedCount} aulas alteradas</h3>
                        <p className="mt-2 text-sm">Disciplinas, datas, horários e carga horária foram preservados.</p></div> : <>
                    <p className="mb-5 text-sm text-slate-500">1. Selecione as aulas <span aria-hidden="true">→</span> 2. Revise a prévia <span aria-hidden="true">→</span> 3. Confirme</p>
                    {!preview ? <>
                        {eligible.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800">Não há aulas futuras agendadas com vínculo de turma disponível para alteração.</p> : <>
                            <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
                                <legend className="sr-only">Selecionar alteração</legend>
                                <div className="flex gap-2" role="group" aria-label="O que alterar">
                                    {(['instrutor', 'sala'] as const).map(value => <button key={value} type="button" aria-pressed={kind === value}
                                        onClick={() => changeKind(value)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${kind === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                        {value === 'instrutor' ? 'Trocar instrutor' : 'Trocar sala'}</button>)}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-sm font-semibold">{kind === 'instrutor' ? 'Instrutor atual' : 'Sala atual'}
                                        <select className={`${fieldClass} mt-1`} value={effectiveSource} onChange={e => { invalidate(); setSource(e.target.value); setDates([]); }}>
                                            <option value="__unset__" disabled>Selecione a origem</option><option value="__all__">Todas as origens desta turma</option>
                                            {origins.map(value => <option key={value || '__none__'} value={value}>{resourceLabel(value)}</option>)}
                                        </select></label>
                                    {kind === 'instrutor' ? <label className="text-sm font-semibold">Novo instrutor
                                        <select className={`${fieldClass} mt-1`} value={target} onChange={e => { invalidate(); setTarget(e.target.value); }}>
                                            <option value="">Selecione o substituto</option>{instrutores.filter(i => effectiveSource === '__all__' || i.id !== effectiveSource).map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                                        </select></label> : <div className="text-sm font-semibold"><label htmlFor="turma-change-room" className="mb-1 block">Nova sala</label><SalaSelect id="turma-change-room" value={target} onChange={value => { invalidate(); setTarget(value); }} className={fieldClass} /></div>}
                                </div>
                                {effectiveSource !== '__unset__' && <section aria-label="Datas da alteração">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Escolha as datas</h3>
                                        <div className="flex gap-3 text-xs"><button type="button" onClick={() => setDates(availableDates)} className="font-semibold text-teal-700 dark:text-teal-300">Selecionar todas</button><button type="button" onClick={() => setDates([])}>Limpar</button></div></div>
                                    <div className="mb-3 flex flex-wrap items-end gap-2"><label className="text-xs">De<input type="date" className={`${fieldClass} mt-1`} value={from} onChange={e => setFrom(e.target.value)} /></label>
                                        <label className="text-xs">Até<input type="date" className={`${fieldClass} mt-1`} value={to} onChange={e => setTo(e.target.value)} /></label>
                                        <button type="button" disabled={!from || !to || from > to} onClick={() => setDates(availableDates.filter(d => d >= from && d <= to))} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:opacity-40 dark:border-slate-600">Selecionar período</button></div>
                                    <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
                                        {availableDates.map(date => <label key={date} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700"><input type="checkbox" checked={dates.includes(date)}
                                            onChange={e => setDates(prev => e.target.checked ? [...prev, date] : prev.filter(d => d !== date))} />{shortDate(date)}</label>)}
                                    </div>
                                </section>}
                                {candidates.length > 0 && <section><h3 className="mb-2 text-sm font-bold">Aulas nas datas selecionadas</h3><p className="mb-2 text-xs text-slate-500">Desmarque uma linha para preservar aquela disciplina.</p>
                                    <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="p-2">Alterar</th><th className="p-2">Data / horário</th><th className="p-2">Disciplina</th><th className="p-2">Atual</th></tr></thead><tbody>
                                        {candidates.map(a => <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2"><input type="checkbox" aria-label={`Alterar ${a.materia} em ${format(a.data, 'dd/MM/yyyy')} às ${a.horarioInicio.slice(0, 5)}`} checked={!excluded.includes(a.id)} onChange={e => setExcluded(prev => e.target.checked ? prev.filter(id => id !== a.id) : [...prev, a.id])} /></td>
                                            <td className="whitespace-nowrap p-2">{format(a.data, 'dd/MM/yyyy')}<br /><span className="text-xs text-slate-500">{a.horarioInicio.slice(0, 5)}–{a.horarioFim.slice(0, 5)}</span></td><td className="p-2">{a.materia}</td><td className="p-2">{resourceLabel(turmaResource(a, kind))}</td></tr>)}
                                    </tbody></table></div></section>}
                            </fieldset>
                            <p role="status" className="mt-4 text-sm font-semibold">{selected.length} aulas selecionadas em {new Set(selected.map(a => localDateKey(a.data))).size} datas.</p>
                            {selected.length > 500 && <p className="mt-2 text-sm text-rose-700">Selecione até 500 aulas por alteração.</p>}
                            <p className="mt-2 text-xs text-slate-500">Aulas iniciadas, concluídas e canceladas ficam fora desta alteração.</p>
                        </>}
                    </> : <>
                        <h3 className="text-lg font-bold">Revisar {preview.changedCount} aulas</h3><p className="mt-1 text-sm text-slate-500">Destino: <strong className="text-slate-800 dark:text-slate-100">{resourceLabel(target)}</strong>. Disciplinas, datas, horários e carga horária serão mantidos.</p>
                        <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">Data / horário</th><th className="p-3">Disciplina</th><th className="p-3">Antes</th><th className="p-3">Depois</th></tr></thead><tbody>{preview.snapshot.map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="whitespace-nowrap p-3">{shortDate(row.data)}<br /><span className="text-xs text-slate-500">{row.horario_inicio}–{row.horario_fim}</span></td><td className="p-3">{turma.aulas.find(a => a.id === row.id)?.materia || 'Disciplina'}</td><td className="p-3">{resourceLabel(kind === 'instrutor' ? row.instrutor_id : row.sala)}</td><td className="p-3 font-semibold text-teal-700 dark:text-teal-300">{resourceLabel(target)}</td>
                        </tr>)}</tbody></table></div>
                        {preview.conflicts.length > 0 ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100"><p className="font-bold">Há conflitos. Nenhuma alteração foi aplicada.</p><ul className="mt-2 space-y-1">{preview.conflicts.map(c => <li key={`${c.id}:${c.data}`}>{shortDate(c.data)} · {c.inicio.slice(0, 5)}–{c.fim.slice(0, 5)} · {c.descricao}</li>)}</ul><p className="mt-2">Volte à seleção e escolha outro destino ou outras aulas.</p></div>
                            : <p role="status" className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100">Nenhum conflito encontrado. A agenda será conferida novamente ao confirmar.</p>}
                    </>}
                </>}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                {savedCount !== null ? <button type="button" onClick={onClose} disabled={busy} className="ml-auto rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">Voltar à agenda</button> : <>
                    <button type="button" disabled={busy} onClick={() => preview ? setPreview(null) : onClose()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-600">{preview ? 'Voltar à seleção' : 'Cancelar'}</button>
                    <button type="button" disabled={busy || !allowed || (!preview && (!target.trim() || selected.length === 0 || selected.length > 500)) || !!preview?.conflicts.length}
                        onClick={preview ? apply : showPreview} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40">{busy ? 'Conferindo…' : preview ? `Confirmar troca em ${preview.changedCount} aulas` : 'Revisar alteração'}</button>
                </>}
            </footer>
        </div>
    </dialog>;
};
