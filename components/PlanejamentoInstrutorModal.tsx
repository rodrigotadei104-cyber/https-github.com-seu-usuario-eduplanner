import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { localDateKey } from '../utils/turmaChanges';
import { shiftDateKey } from '../utils/turmaReschedule';
import { computeInstructorPlanning, planningMinutes, planningTime, suggestInstructorRoutine, validateRoutine } from '../utils/instructorPlanning';
import type { RoutineWindow, PlanningSlot } from '../utils/instructorPlanning';
import { instructorPlanningService } from '../services/instructorPlanning.service';
import type { InstructorPlanningData } from '../services/instructorPlanning.service';
import { RotinaInstrutorEditor } from './RotinaInstrutorEditor';

interface Props { isOpen:boolean;onClose:()=>void }
const field='mt-1 block rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-600';
const primary='rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40';
const labelDate=(date:string)=>format(new Date(`${date}T12:00:00`),'EEE, dd/MM/yyyy',{locale:ptBR});
const hours=(minutes:number)=>`${Math.floor(minutes/60)}h${minutes%60?String(minutes%60).padStart(2,'0'):''}`;
const slotKey=(s:PlanningSlot)=>`${s.data}:${s.inicio}:${s.fim}:${s.habitual}`;
export function PlanejamentoInstrutorModal({isOpen,onClose}:Props){
    const {instrutores,userProfile}=useSchedule();const dialog=useRef<HTMLDialogElement>(null),request=useRef(0);
    const today=localDateKey(new Date());
    const [instructor,setInstructor]=useState(''),[from,setFrom]=useState(today),[to,setTo]=useState(shiftDateKey(today,27));
    const [data,setData]=useState<InstructorPlanningData|null>(null),[windows,setWindows]=useState<RoutineWindow[]>([]);
    const [simulated,setSimulated]=useState<PlanningSlot[]>([]),[starts,setStarts]=useState<Record<string,string>>({});
    const [duration,setDuration]=useState('240'),[exploreStart,setExploreStart]=useState('06:00'),[exploreEnd,setExploreEnd]=useState('23:00');
    const [alternatives,setAlternatives]=useState(false),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false);
    const [error,setError]=useState(''),[notice,setNotice]=useState(''),[tick,setTick]=useState(0),[receivedAt,setReceivedAt]=useState(0);
    const canSave=['admin','editor'].includes(userProfile.role);
    useEffect(()=>{const el=dialog.current;if(isOpen){setInstructor('');setBusy(false);setSaving(false);setStarts({});setData(null);setSimulated([]);setWindows([]);setError('');setNotice('');setFrom(today);setTo(shiftDateKey(today,27));setAlternatives(false);if(!el?.open)el?.showModal();}else el?.close();return()=>{request.current++;el?.close();};},[isOpen]);
    useEffect(()=>{if(!isOpen)return;const timer=window.setInterval(()=>setTick(v=>v+1),60000);return()=>window.clearInterval(timer);},[isOpen]);
    const invalidate=()=>{request.current++;setData(null);setSimulated([]);setStarts({});setWindows([]);setError('');setNotice('');};
    const load=async()=>{
        if(!instructor||busy||saving)return;const token=++request.current;setBusy(true);setError('');setNotice('');setData(null);setSimulated([]);setStarts({});
        try{const result=await instructorPlanningService.load(instructor,from,to);if(token===request.current){setData(result);setWindows(result.routine.janelas);setReceivedAt(Date.now());}}
        catch(err){if(token===request.current)setError(err instanceof Error?err.message:'Não foi possível consultar a agenda.');}
        finally{if(token===request.current)setBusy(false);}
    };
    const save=async()=>{
        if(!data||saving||busy||!canSave)return;const token=request.current;setSaving(true);setError('');setNotice('');
        try{const result=await instructorPlanningService.save(instructor,windows,data.routine.updated_at);if(token===request.current){setData({...data,routine:result});setNotice('Rotina salva para a unidade. A agenda de aulas não foi alterada.');}}
        catch(err){if(token===request.current)setError(err instanceof Error?err.message:'Não foi possível salvar a rotina.');}
        finally{setSaving(false);}
    };
    const suggest=()=>{if(!data)return;const result=suggestInstructorRoutine(data.history,data.historyFrom,data.historyTo);setWindows(result.windows);
        setNotice(result.windows.length?`Sugestão baseada em ${result.daysObserved} dias com aulas nos últimos 84 dias. Foram usados horários repetidos em pelo menos dois dias do mesmo dia da semana. Revise os intervalos e salve apenas se representarem a rotina habitual.`:'Histórico insuficiente para sugerir uma rotina recorrente. Cadastre os intervalos manualmente.');};
    const result=useMemo(()=>{if(!data)return{days:[],validation:''};try{return{days:computeInstructorPlanning({from,to,routine:windows,bookings:data.bookings,blocks:data.blocks,simulated,exploreStart:alternatives?exploreStart:'06:00',exploreEnd:alternatives?exploreEnd:'23:00',duration:Number(duration)}),validation:''};}catch(err){return{days:[],validation:err instanceof Error?err.message:'Revise os parâmetros.'};}},[data,from,to,windows,simulated,exploreStart,exploreEnd,duration,tick,alternatives]);
    const stale=!!data&&Date.now()-receivedAt>5*60000;
    const dirty=!!data&&JSON.stringify(windows)!==JSON.stringify(data.routine.janelas);
    const routineError=validateRoutine(windows);
    const totalHabitual=result.days.reduce((sum,d)=>sum+d.livres.length,0);
    const habitualCount=result.days.reduce((sum,d)=>sum+d.livres.filter(s=>s.comportaBloco).length,0),extraCount=result.days.reduce((sum,d)=>sum+d.alternativas.filter(s=>s.comportaBloco).length,0);
    const add=(slot:PlanningSlot)=>{
        if(stale||busy||saving||slot.comportaBloco===false)return;const value=starts[slotKey(slot)]||slot.inicio,start=planningMinutes(value),end=start+Number(duration);
        if(!Number.isFinite(start)||start<planningMinutes(slot.inicio)||end>planningMinutes(slot.fim)){setError('O bloco deve caber integralmente na faixa livre escolhida.');return;}
        setSimulated(previous=>[...previous,{...slot,inicio:planningTime(start),fim:planningTime(end)}]);setError('');
    };
    const renderSlot=(slot:PlanningSlot)=><div key={slotKey(slot)} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${slot.habitual?'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950':'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'}`}>
        <div className="min-w-40 flex-1"><p className="font-semibold">{slot.inicio}–{slot.fim} · {hours(planningMinutes(slot.fim)-planningMinutes(slot.inicio))} livres</p><p className="text-xs text-slate-600 dark:text-slate-300">{slot.habitual?'Dentro da rotina':'Fora da rotina · disponibilidade a confirmar'}</p>{slot.comportaBloco===false&&<p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">Este intervalo está livre, mas é menor que o bloco de {Number(duration)} minutos. Reduza a duração para utilizá-lo.</p>}</div>
        <label className="text-xs">Iniciar às<input type="time" aria-label={`Início do bloco em ${slot.data}, faixa ${slot.inicio} a ${slot.fim}`} className={field} value={starts[slotKey(slot)]||slot.inicio} onChange={e=>setStarts({...starts,[slotKey(slot)]:e.target.value})} disabled={busy||saving||stale||slot.comportaBloco===false}/></label>
        <button type="button" className={button} onClick={()=>add(slot)} disabled={busy||saving||stale||slot.comportaBloco===false}>{slot.habitual?'Adicionar à simulação':'Simular exceção'}</button>
    </div>;
    return <dialog ref={dialog} aria-labelledby="planning-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}} className="m-auto max-h-[94vh] w-[min(1240px,96vw)] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/55 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex max-h-[94vh] flex-col"><header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">Mapa de Instrutores</p><h2 id="planning-title" className="mt-1 text-xl font-bold">Simular planejamento</h2><p className="mt-1 text-sm text-slate-500">Encontre intervalos livres e experimente uma distribuição de aulas. A simulação não reserva horários nem cria aulas.</p></div><button type="button" onClick={onClose} disabled={saving} className={button}>Fechar</button></header>
        <div className="overflow-y-auto p-5">
            {error&&<p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
            {notice&&<p role="status" className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">{notice}</p>}
            <fieldset disabled={busy||saving} className="flex flex-wrap items-end gap-3"><legend className="sr-only">Instrutor e período</legend>
                <label className="min-w-56 flex-1 text-sm font-semibold">Instrutor<select className={`${field} w-full`} value={instructor} onChange={e=>{invalidate();setInstructor(e.target.value);}}><option value="">Selecione um instrutor</option>{[...instrutores].sort((a,b)=>a.nome.localeCompare(b.nome)).map(i=><option key={i.id} value={i.id}>{i.nome}</option>)}</select></label>
                <label className="text-sm">De<input type="date" min={today} value={from} className={field} onChange={e=>{invalidate();setFrom(e.target.value);}}/></label><label className="text-sm">Até<input type="date" min={from||today} value={to} className={field} onChange={e=>{invalidate();setTo(e.target.value);}}/></label>
                <button type="button" className={primary} disabled={!instructor||busy||saving} onClick={load}>{busy?'Consultando…':data?'Atualizar agenda':'Consultar agenda'}</button>
            </fieldset>
            <p className="mt-2 text-xs text-slate-500">Uma nova consulta ou mudança de instrutor/período reinicia o rascunho e os ajustes locais da rotina. A rotina salva continua disponível.</p>
            {data&&<div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="space-y-4"><details open className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-bold">Rotina habitual</summary><p className="my-3 text-xs text-slate-500">Referência semanal compartilhada pela unidade. Ajustes abaixo afetam a simulação; salve para reutilizar com este instrutor.</p>
                    <button type="button" className={`${button} mb-3 w-full`} disabled={busy||saving} onClick={suggest}>Sugerir pelo histórico</button>
                    <RotinaInstrutorEditor windows={windows} disabled={busy||saving} onChange={value=>{setWindows(value);setNotice('Rotina ajustada apenas nesta simulação.');}}/>
                    {routineError&&<p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{routineError}</p>}
                    {canSave&&<button type="button" disabled={!dirty||!!routineError||saving||busy} className={`${primary} mt-3 w-full`} onClick={save}>{saving?'Salvando…':'Salvar rotina para a unidade'}</button>}
                    <p className="mt-2 text-xs text-slate-500">{dirty?'Há ajustes não salvos.':data.routine.updated_at?'Rotina salva carregada.':'Nenhuma rotina salva. Cadastre ou revise uma sugestão.'} O histórico reflete agendamentos; pode não representar a jornada de trabalho completa.</p>
                </details>
                <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-bold">Parâmetros da simulação</h3><label className="mt-3 block text-sm">Duração de cada bloco (minutos relógio)<input type="number" min={15} max={720} step={15} value={duration} className={`${field} w-full`} onChange={e=>setDuration(e.target.value)}/></label><p className="mt-1 text-xs text-slate-500">Ex.: 240 minutos = 4 horas de agenda, incluindo eventuais intervalos que você planejar.</p>
                    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={alternatives} onChange={e=>setAlternatives(e.target.checked)}/><span>Mostrar horários fora da rotina</span></label>
                    {alternatives&&<div className="mt-3 flex gap-2"><label className="text-xs">Explorar de<input type="time" value={exploreStart} className={field} onChange={e=>setExploreStart(e.target.value)}/></label><label className="text-xs">Até<input type="time" value={exploreEnd} className={field} onChange={e=>setExploreEnd(e.target.value)}/></label></div>}
                </section>
                <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-bold">Aulas simuladas · {hours(simulated.reduce((sum,s)=>sum+planningMinutes(s.fim)-planningMinutes(s.inicio),0))}</h3>{!simulated.length?<p className="mt-2 text-sm text-slate-500">Adicione blocos das faixas livres ao lado.</p>:<ul className="mt-3 space-y-3">{simulated.map((s,index)=><li key={`${s.data}:${s.inicio}`} className="text-sm"><div className="flex items-start justify-between gap-2"><span>{labelDate(s.data)}<br/><strong>{s.inicio}–{s.fim}</strong></span><button type="button" className="text-rose-700 dark:text-rose-300" aria-label={`Retirar bloco de ${s.data} às ${s.inicio}`} onClick={()=>setSimulated(previous=>previous.filter((_,i)=>i!==index))}>Retirar</button></div></li>)}</ul>}<p className="mt-3 text-xs text-slate-500">Rascunho desta consulta. Não há gravação de aulas.</p></section>
                </aside>
                <section className="min-w-0"><div className="mb-4 flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-bold">Horários livres para planejar</h3><p className="text-sm text-slate-500">{totalHabitual} faixas livres na rotina · {habitualCount} comportam o bloco{alternatives?` · ${extraCount} alternativas`:''} para blocos de {Number(duration)||0} minutos.</p></div><p className="text-xs text-slate-500">Consulta: {format(new Date(data.loadedAt),'dd/MM HH:mm')}</p></div>
                    {stale&&<p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">A consulta tem mais de cinco minutos. Atualize a agenda antes de adicionar novos blocos. O rascunho será reiniciado.</p>}
                    {data.legacyCount>0&&<p className="mb-3 text-xs text-slate-500">{data.legacyCount} compromissos antigos foram identificados pelo nome do instrutor. Foram considerados ocupados por segurança.</p>}
                    {!windows.length&&<p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">Defina a rotina habitual para priorizar horários. Você também pode ativar a visualização fora da rotina.</p>}
                    {result.validation?<p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{result.validation}</p>:<div className="space-y-3">{result.days.map(day=><article key={day.data} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h4 className="mb-3 font-bold capitalize">{labelDate(day.data)}</h4>{day.bloqueios.length>0?<p className="text-sm text-rose-700 dark:text-rose-300">{day.bloqueios.join(' · ')}</p>:<><div className="space-y-2">{day.livres.map(renderSlot)}{alternatives&&day.alternativas.map(renderSlot)}</div>{!day.livres.length&&(!alternatives||!day.alternativas.length)&&<p className="text-sm text-slate-500">Sem intervalo livre na rotina deste dia. Consulte os compromissos abaixo ou ative horários fora da rotina.</p>}</>}{day.ocupacoes.length>0&&<details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Ver {day.ocupacoes.length} compromissos da agenda</summary><ul className="mt-2 space-y-1">{day.ocupacoes.map(o=><li key={o.id}>{o.diaInteiro?'Dia inteiro':`${o.inicio.slice(0,5)}–${o.fim.slice(0,5)}`} · {o.descricao}</li>)}</ul></details>}</article>)}</div>}
                    <p className="mt-4 text-xs text-slate-500">Esta é uma consulta da disponibilidade do instrutor; salas serão conferidas ao cadastrar as aulas. A disponibilidade reflete a consulta acima. Outros usuários podem alterar a agenda; confirme novamente antes de cadastrar aulas.</p>
                </section>
            </div>}
        </div></div>
    </dialog>;
}
