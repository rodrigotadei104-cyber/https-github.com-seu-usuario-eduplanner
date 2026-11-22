import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { catalogoService } from '../services/catalogo.service';
import { coursePlanningService, CourseCommitUncertainError } from '../services/coursePlanning.service';
import type { CourseCreationRequest, CoursePlanningData } from '../services/coursePlanning.service';
import type { CatalogoCurso } from '../types';
import { localDateKey } from '../utils/turmaChanges';
import { shiftDateKey } from '../utils/turmaReschedule';
import { validDateKey } from '../utils/turmaReschedule';
import { curriculumMinutes, suggestCourseSchedule, validateCourseSessions } from '../utils/coursePlanning';
import type { CoursePlanningInput, CourseProposal, CourseSession } from '../utils/coursePlanning';
import { groupWorkPeriods, protectedWorkBreaks, suggestedWorkPeriods, workPeriodsFromGroups } from '../utils/instructorTurns';
import type { WorkPeriodGroup } from '../utils/instructorTurns';
import { PlanningPeriodGroups } from './PlanningPeriodGroups';
import { SalaSelect } from './SalaSelect';

const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-600';
const primary = 'rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40';
const dateLabel = (date: string) => validDateKey(date) ? format(new Date(`${date}T12:00:00`), 'EEE, dd/MM/yyyy', { locale: ptBR }) : 'Revise a data';
const hours = (minutes: number, mph: number) => (minutes / mph).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function CoursePlanningPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
    const { instrutores, userProfile, refreshData } = useSchedule();
    const [courses, setCourses] = useState<CatalogoCurso[]>([]);
    const [courseId, setCourseId] = useState(''), [instructor, setInstructor] = useState('');
    const [from, setFrom] = useState(''), [to, setTo] = useState(''), [room, setRoom] = useState('');
    const [dataset, setDataset] = useState<CoursePlanningData | null>(null);
    const [custom, setCustom] = useState(false), [groups, setGroups] = useState<WorkPeriodGroup[]>([]);
    const [excluded, setExcluded] = useState<string[]>([]), [proposal, setProposal] = useState<CourseProposal | null>(null);
    const [number, setNumber] = useState(''), [checked, setChecked] = useState<unknown>(null);
    const [phase, setPhase] = useState(''), [catalogBusy, setCatalogBusy] = useState(true);
    const [error, setError] = useState(''), [success, setSuccess] = useState('');
    const [uncertain, setUncertain] = useState<CourseCreationRequest | null>(null);
    const request = useRef(0), operationId = useRef('');
    const today = localDateKey(new Date()), searchFrom = from || today, searchTo = to || shiftDateKey(searchFrom, 179);
    const busy = !!phase || catalogBusy, frozen = busy || !!uncertain;
    const canCreate = ['admin', 'editor'].includes(userProfile.role);

    useEffect(() => {
        let live = true;
        catalogoService.getCursos().then(c => { if (live) setCourses(c.filter(x => x.ativo)); })
            .catch(() => { if (live) setError('Não foi possível carregar o catálogo. Volte à consulta e abra o planejamento novamente.'); })
            .finally(() => { if (live) setCatalogBusy(false); });
        return () => { live = false; request.current++; };
    }, []);
    useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
    const reference = useMemo(() => dataset ? suggestedWorkPeriods(dataset.planning.routine.janelas, dataset.planning.history, dataset.planning.historyFrom, dataset.planning.historyTo) : null, [dataset]);
    const input = useMemo<CoursePlanningInput | null>(() => dataset && reference ? {
        course: dataset.course, subjects: dataset.subjects, from: searchFrom, to: searchTo,
        windows: custom ? workPeriodsFromGroups(groups) : reference.windows,
        pauses: protectedWorkBreaks(reference.windows, dataset.planning.routine.pausas),
        bookings: [...dataset.planning.bookings, ...dataset.roomBookings], blocks: dataset.planning.blocks, excludedDates: excluded
    } : null, [dataset, reference, searchFrom, searchTo, custom, groups, excluded]);
    const validation = useMemo(() => {
        if (!input || !proposal) return [];
        try { return validateCourseSessions(input, proposal.sessions); } catch (err) { return [err instanceof Error ? err.message : 'Revise a proposta.']; }
    }, [input, proposal]);
    const mph = dataset ? curriculumMinutes(dataset.course, dataset.subjects).minutesPerHour : 60;
    const ordered = proposal ? [...proposal.sessions].sort((a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio)) : [];
    const clear = (clearData = true, resetExcluded = false) => { request.current++; setChecked(null); setProposal(null); setError(''); if (resetExcluded) setExcluded([]); if (clearData) setDataset(null); };
    const calculate = async () => {
        if (!courseId || !instructor || frozen) return;
        const token = ++request.current; setPhase('Consultando agenda e preparando proposta…'); setError(''); setChecked(null);
        setProposal(null);
        try {
            const result = await coursePlanningService.load(courseId, instructor, searchFrom, searchTo, room);
            if (token !== request.current) return;
            const ref = suggestedWorkPeriods(result.planning.routine.janelas, result.planning.history, result.planning.historyFrom, result.planning.historyTo);
            const selectedGroups = custom ? groups : groupWorkPeriods(ref.windows);
            const args: CoursePlanningInput = {
                course: result.course, subjects: result.subjects, from: searchFrom, to: searchTo,
                windows: custom ? workPeriodsFromGroups(selectedGroups) : ref.windows,
                pauses: protectedWorkBreaks(ref.windows, result.planning.routine.pausas),
                bookings: [...result.planning.bookings, ...result.roomBookings], blocks: result.planning.blocks, excludedDates: excluded
            };
            const next = suggestCourseSchedule(args);
            setDataset(result); setGroups(selectedGroups); setProposal(next); operationId.current = crypto.randomUUID();
        } catch (err) { if (token === request.current) { setDataset(null); setError(err instanceof Error ? err.message : 'Não foi possível calcular a proposta.'); } }
        finally { if (token === request.current) setPhase(''); }
    };
    const excludeDay = (date: string) => {
        if (!input || frozen) return;
        const dates = [...new Set([...excluded, date])];
        try { setProposal(suggestCourseSchedule({ ...input, excludedDates: dates })); setExcluded(dates); setChecked(null); setError(''); }
        catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ajustar a proposta.'); }
    };
    const edit = (index: number, key: keyof CourseSession, value: string) => {
        setProposal(previous => {
            if (!previous) return previous;
            const sessions = previous.sessions.map((s, i) => i === index ? { ...s, [key]: value } : s);
            const allocatedMinutes = sessions.reduce((total, s) => { const a = s.inicio.split(':').map(Number), b = s.fim.split(':').map(Number); const minutes = b[0]*60+b[1]-a[0]*60-a[1]; return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0); }, 0);
            return { ...previous, sessions, allocatedMinutes, missingMinutes: Math.max(0, previous.requiredMinutes - allocatedMinutes) };
        });
        setChecked(null); setError('');
    };
    const submit = async (apply: boolean) => {
        if (busy || !proposal || !canCreate || (!uncertain && validation.length)) return;
        const payload: CourseCreationRequest = uncertain || { id: operationId.current, curso: courseId, instrutor: instructor, numero: number.trim(), sala: room.trim(), inicioBusca: searchFrom, fimBusca: searchTo, aulas: proposal.sessions };
        if (!payload.numero || !payload.sala) { setError('Informe o número da turma e escolha uma sala para conferir a criação.'); return; }
        setPhase(apply ? 'Confirmando turma e aulas…' : 'Conferindo a proposta na agenda atual…'); setError('');
        try {
            const result = await coursePlanningService.submit(payload, apply, checked);
            if (apply && result.applied) {
                setUncertain(null); setSuccess(`Turma ${payload.numero} criada com ${result.count} aulas.`); setChecked(null);
                try { await refreshData(); } catch { setError('A turma foi criada. Atualize a página para carregar a agenda novamente.'); }
            } else if (!apply && !result.applied) setChecked(result.snapshot);
            else throw new Error('Não foi possível confirmar a criação. Confira a turma antes de tentar novamente.');
        } catch (err) {
            if (apply && err instanceof CourseCommitUncertainError) { setUncertain(payload); setError('A conexão caiu durante a confirmação. Clique em “Verificar criação” para conferir o mesmo pedido sem duplicar a turma.'); }
            else { setUncertain(null); setChecked(null); setError(err instanceof Error ? err.message : 'Não foi possível concluir.'); }
        } finally { setPhase(''); }
    };
    if (success) return <section role="status" className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-800 dark:bg-teal-950"><h3 className="text-lg font-bold">{success}</h3><p>As aulas já estão disponíveis na agenda e a turma pode ser acompanhada em Turmas.</p>{error && <p>{error}</p>}<button className={button} type="button" onClick={() => { clear(true,true); setSuccess(''); setNumber(''); setUncertain(null); }}>Montar outro cronograma</button></section>;
    return <section aria-label="Montar cronograma de curso" className="space-y-5">
        <div><h3 className="text-lg font-bold">Um curso nos dias livres do instrutor</h3><p className="mt-1 text-sm text-slate-500">Escolha o curso e o instrutor. O sistema sugere quando começar e terminar.</p></div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
        <fieldset disabled={frozen} className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">Curso e instrutor</legend>
            <label className="text-sm font-semibold">Curso<select className={field} value={courseId} onChange={e => { clear(true,true); setCustom(false); setGroups([]); setCourseId(e.target.value); }}><option value="">{catalogBusy ? 'Carregando catálogo…' : 'Selecione um curso'}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.nomeCurso} · {c.cargaTotalHoras} h</option>)}</select></label>
            <label className="text-sm font-semibold">Instrutor<select className={field} value={instructor} onChange={e => { clear(true,true); setCustom(false); setGroups([]); setInstructor(e.target.value); }}><option value="">Selecione um instrutor</option>{[...instrutores].sort((a, b) => a.nome.localeCompare(b.nome)).map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></label>
        </fieldset>
        <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Restrições opcionais e sala</summary>
            <fieldset disabled={frozen} className="mt-4 grid gap-4 sm:grid-cols-2"><legend className="sr-only">Restrições da busca</legend>
                <label className="text-sm">Procurar a partir de<input type="date" min={today} className={field} value={from} onChange={e => { clear(); setFrom(e.target.value); }}/><span className="text-xs text-slate-500">Em branco: próximos horários livres a partir de hoje.</span></label>
                <label className="text-sm">Precisa terminar até<input type="date" min={searchFrom} max={shiftDateKey(searchFrom, 179)} className={field} value={to} onChange={e => { clear(); setTo(e.target.value); }}/><span className="text-xs text-slate-500">Em branco: procura até {dateLabel(shiftDateKey(searchFrom, 179))}.</span></label>
                <div className="text-sm sm:col-span-2"><label htmlFor="course-planning-room">Sala para conferir disponibilidade</label><SalaSelect id="course-planning-room" value={room} onChange={value => { clear(); setRoom(value); }} disabled={frozen} className={field} emptyLabel="Posso escolher depois"/><p className="mt-1 text-xs text-slate-500">Opcional para simular. Para criar as aulas, escolha a sala e atualize a proposta.</p></div>
            </fieldset>
        </details>
        {dataset && reference && <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">Horários considerados</h4><p className="text-xs text-slate-500">{custom ? 'Horários escolhidos por você · somente nesta proposta' : reference.source}</p></div><div className="flex gap-2"><button disabled={frozen} type="button" aria-pressed={!custom} className={!custom ? primary : button} onClick={() => { clear(false); setCustom(false); }}>Sugestão do sistema</button><button disabled={frozen} type="button" aria-pressed={custom} className={custom ? primary : button} onClick={() => { clear(false); setCustom(true); }}>Escolher meus horários</button></div></div>{custom ? <div className="mt-4"><PlanningPeriodGroups groups={groups} onChange={value => { clear(false); setGroups(value); }} disabled={frozen}/></div> : <p className="mt-2 text-sm">{groupWorkPeriods(reference.windows).map(g => `${g.dias.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ')}: ${g.periodos.map(p => `${p.inicio}–${p.fim}`).join(' / ')}`).join(' · ')}</p>}<p className="mt-2 text-xs text-slate-500">Refeições e intervalos cadastrados são respeitados. Um turno com compromisso não é usado; sobras curtas entre aulas não viram novos turnos.</p></section>}
        <div className="flex flex-wrap items-center gap-3"><button type="button" className={primary} disabled={frozen || !courseId || !instructor} onClick={calculate}>{phase || (dataset ? 'Atualizar proposta' : 'Sugerir cronograma')}</button><span className="text-xs text-slate-500">Busca até 180 dias. A simulação não reserva horários.</span></div>
        {proposal && dataset && <>
            <div className={`rounded-xl border p-4 ${proposal.missingMinutes ? 'border-amber-300 bg-amber-50 dark:bg-amber-950' : 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950'}`} role="status"><h4 className="font-bold">{proposal.missingMinutes ? 'Disponibilidade insuficiente no período' : 'Proposta de cronograma'}</h4><p className="mt-1 text-sm">{hours(proposal.allocatedMinutes, mph)} de {hours(proposal.requiredMinutes, mph)} horas-aula distribuídas · hora-aula de {mph} minutos.</p>{proposal.missingMinutes > 0 && <p className="mt-1 text-sm">Faltam {hours(proposal.missingMinutes, mph)} horas-aula. Amplie a busca ou ajuste os dias e horários.</p>}{ordered.length > 0 && <p className="mt-2 text-sm">Início sugerido: <strong>{dateLabel(ordered[0].data)}</strong> · {proposal.missingMinutes ? 'Última data encontrada' : 'Término previsto'}: <strong>{dateLabel(ordered.at(-1)!.data)}</strong></p>}<p className="mt-2 text-xs">{room ? `Sala considerada: ${room}.` : 'Disponibilidade do instrutor. Sala ainda não conferida.'} Agenda consultada em {format(new Date(dataset.planning.loadedAt), 'dd/MM HH:mm')}.</p></div>
            {excluded.length > 0 && <div className="text-sm"><p>Dias retirados da proposta:</p><div className="mt-2 flex flex-wrap gap-2">{excluded.map(d => <button type="button" className={button} disabled={frozen} key={d} onClick={() => { const dates = excluded.filter(x => x !== d); setExcluded(dates); setChecked(null); if (input) setProposal(suggestCourseSchedule({ ...input, excludedDates: dates })); }}>Reconsiderar {dateLabel(d)}</button>)}</div></div>}
            {proposal.sessions.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-3 text-left text-slate-500">Revise as aulas. Você pode ajustar datas e horários ou retirar um dia para redistribuir o curso.</caption><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="p-2">Disciplina</th><th className="p-2">Data</th><th className="p-2">Início</th><th className="p-2">Fim</th><th className="p-2"><span className="sr-only">Ajustar proposta</span></th></tr></thead><tbody>{proposal.sessions.map((s, index) => <tr key={index} className="border-b border-slate-100 dark:border-slate-800"><td className="min-w-40 p-2">{dataset.subjects.find(d => d.id === s.disciplinaId)?.nomeDisciplina}</td><td className="p-2"><input type="date" aria-label={`Data da aula ${index + 1}`} className={field} min={searchFrom} max={searchTo} value={s.data} disabled={frozen} onChange={e => edit(index, 'data', e.target.value)}/></td><td className="p-2"><input type="time" aria-label={`Início da aula ${index + 1}`} className={field} value={s.inicio} disabled={frozen} onChange={e => edit(index, 'inicio', e.target.value)}/></td><td className="p-2"><input type="time" aria-label={`Fim da aula ${index + 1}`} className={field} value={s.fim} disabled={frozen} onChange={e => edit(index, 'fim', e.target.value)}/></td><td className="p-2"><button type="button" className={button} disabled={frozen} onClick={() => excludeDay(s.data)}>Não usar este dia</button></td></tr>)}</tbody></table></div>}
            {validation.length > 0 && <ul className="list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{validation.map(e => <li key={e}>{e}</li>)}</ul>}
            {canCreate ? <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h4 className="font-bold">Criar turma com esta proposta</h4><p className="text-sm text-slate-500">A conferência verifica a agenda atual. A turma e todas as aulas serão criadas juntas após sua confirmação.</p><label className="block max-w-sm text-sm">Número da turma<input type="text" maxLength={80} className={field} value={number} disabled={frozen} onChange={e => { setNumber(e.target.value); setChecked(null); }}/></label>{!room && <p className="text-sm text-amber-800 dark:text-amber-200">Escolha a sala em “Restrições opcionais e sala” e atualize a proposta para poder criar.</p>}{uncertain ? <button type="button" className={primary} disabled={busy} onClick={() => submit(true)}>Verificar criação</button> : checked ? <div className="space-y-3"><p className="text-sm">Conferência concluída. Confirma criar a turma <strong>{number}</strong>, com {proposal.sessions.length} aulas na sala {room}?</p><div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={frozen} onClick={() => submit(true)}>Confirmar criação da turma e aulas</button><button type="button" className={button} disabled={frozen} onClick={() => setChecked(null)}>Continuar revisando</button></div></div> : <button type="button" className={primary} disabled={frozen || validation.length > 0 || !!proposal.missingMinutes || !number.trim() || !room.trim()} onClick={() => submit(false)}>Conferir antes de criar</button>}</section> : <p className="text-sm text-slate-500">Você pode simular. A criação de turmas exige acesso de administrador ou editor.</p>}
        </>}
    </section>;
}
