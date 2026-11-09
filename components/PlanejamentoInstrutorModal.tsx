import React,{useEffect,useMemo,useRef,useState} from 'react';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {useSchedule} from '../context/ScheduleContext';
import {localDateKey} from '../utils/turmaChanges';
import {shiftDateKey} from '../utils/turmaReschedule';
import {computeInstructorTurns,protectedWorkBreaks,suggestedWorkPeriods,groupWorkPeriods,workPeriodsFromGroups} from '../utils/instructorTurns';
import {PlanningPeriodGroups} from './PlanningPeriodGroups';
import type {PlanningTurn,WorkPeriodGroup} from '../utils/instructorTurns';
import type {PlanningSlot,RoutineWindow} from '../utils/instructorPlanning';
import {instructorPlanningService} from '../services/instructorPlanning.service';
import type {InstructorPlanningData} from '../services/instructorPlanning.service';

interface Props{isOpen:boolean;onClose:()=>void}
interface Draft extends PlanningSlot{excecao:boolean}
const field='mt-1 block rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-600';
const primary='rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40';
const weekdayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const dateLabel=(d:string)=>format(new Date(`${d}T12:00:00`),'EEE, dd/MM/yyyy',{locale:ptBR});
export function PlanejamentoInstrutorModal({isOpen,onClose}:Props){
 const {instrutores}=useSchedule();const dialog=useRef<HTMLDialogElement>(null),request=useRef(0),loadedInstructor=useRef('');
 const today=localDateKey(new Date());
 const [instructor,setInstructor]=useState(''),[from,setFrom]=useState(today),[to,setTo]=useState(shiftDateKey(today,27));
 const [data,setData]=useState<InstructorPlanningData|null>(null),[reference,setReference]=useState<{windows:RoutineWindow[];source:string;historicalDays:number[]}>({windows:[],source:'',historicalDays:[]});
 const [mode,setMode]=useState<'suggestion'|'custom'>('suggestion');
 const [groups,setGroups]=useState<WorkPeriodGroup[]>([]);
 const [exact,setExact]=useState(false),[onlyOptions,setOnlyOptions]=useState(false);
 const [simulated,setSimulated]=useState<Draft[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{const el=dialog.current;if(isOpen){setInstructor('');loadedInstructor.current='';setData(null);setSimulated([]);setMode('suggestion');setExact(false);setBusy(false);setError('');setFrom(today);setTo(shiftDateKey(today,27));setOnlyOptions(false);if(!el?.open)el?.showModal();}else el?.close();return()=>{request.current++;el?.close();};},[isOpen]);
 useEffect(()=>{if(!isOpen)return;const timer=window.setInterval(()=>setTick(v=>v+1),60000);return()=>window.clearInterval(timer);},[isOpen]);
 const invalidate=()=>{request.current++;setData(null);setError('');};
 const load=async()=>{
  if(!instructor||busy)return;const token=++request.current;setBusy(true);setError('');
  try{const result=await instructorPlanningService.load(instructor,from,to);if(token!==request.current)return;
   const proposal=suggestedWorkPeriods(result.routine.janelas,result.history,result.historyFrom,result.historyTo);
   if(loadedInstructor.current!==instructor){setMode('suggestion');setExact(false);setGroups(groupWorkPeriods(proposal.windows));}
   setReference(proposal);setData(result);loadedInstructor.current=instructor;setSimulated(previous=>previous.filter(s=>s.data>=from&&s.data<=to));
  }catch(err){if(token===request.current){setData(null);setError(err instanceof Error?err.message:'Não foi possível consultar a agenda.');}}
  finally{if(token===request.current)setBusy(false);}
 };
 const workWindows=useMemo(()=>mode==='suggestion'?reference.windows:workPeriodsFromGroups(groups),[mode,reference,groups]);
 const savedBreaks=useMemo(()=>data?protectedWorkBreaks(reference.windows,data.routine.pausas):[],[data,reference]);
 const effectiveBreaks=mode==='custom'&&exact?[]:savedBreaks;
 const result=useMemo(()=>{
  if(!data)return{days:[],validation:''};if(mode==='custom'&&!groups.some(g=>g.dias.length))return{days:[],validation:'Selecione os dias da semana que deseja considerar.'};
  try{return{days:computeInstructorTurns({from,to,windows:workWindows,pauses:effectiveBreaks,bookings:data.bookings,blocks:data.blocks,simulated}),validation:''};}
  catch(err){return{days:[],validation:err instanceof Error?err.message:'Revise o horário escolhido.'};}
 },[data,from,to,workWindows,effectiveBreaks,simulated,tick,mode,groups]);
 const draftConflicts=useMemo(()=>simulated.map(s=>{
  if(!data)return false;try{const day=computeInstructorTurns({from:s.data,to:s.data,windows:[{dia:new Date(`${s.data}T12:00:00`).getDay(),inicio:s.inicio,fim:s.fim}],pauses:s.excecao?[]:savedBreaks,bookings:data.bookings,blocks:data.blocks,simulated:[]})[0];
   return !day.turnos.some(t=>t.inicio===s.inicio&&t.fim===s.fim&&t.status==='disponivel');}catch{return true;}
 }),[data,simulated,savedBreaks,tick]);
 const visible=result.days.filter(d=>onlyOptions?d.turnos.some(t=>t.status!=='ocupado'):d.turnos.length>0||d.bloqueios.length>0);
 const freeDays=result.days.filter(d=>d.turnos.some(t=>t.status==='disponivel')).length;
 const add=(turn:PlanningTurn)=>{if(busy||turn.status!=='disponivel')return;setSimulated(previous=>[...previous,{data:turn.data,inicio:turn.inicio,fim:turn.fim,habitual:mode==='suggestion',excecao:mode==='custom'&&exact}]);};
 return <dialog ref={dialog} aria-labelledby="planning-title" onCancel={e=>{e.preventDefault();onClose();}} className="m-auto max-h-[94vh] w-[min(1160px,96vw)] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/55 dark:bg-slate-900 dark:text-slate-100">
  <div className="flex max-h-[94vh] flex-col"><header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">Mapa de Instrutores</p><h2 id="planning-title" className="mt-1 text-xl font-bold">Dias e turnos para planejar</h2><p className="mt-1 text-sm text-slate-500">Escolha o instrutor, consulte o período e adicione os turnos úteis ao rascunho.</p></div><button type="button" onClick={onClose} className={button}>Fechar</button></header>
  <div className="overflow-y-auto p-5">
   {error&&<p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
   <fieldset disabled={busy} className="flex flex-wrap items-end gap-3"><legend className="sr-only">Instrutor e período da consulta</legend>
    <label className="min-w-56 flex-1 text-sm font-semibold">Instrutor<select className={`${field} w-full`} value={instructor} onChange={e=>{invalidate();setInstructor(e.target.value);loadedInstructor.current='';setSimulated([]);}}><option value="">Selecione um instrutor</option>{[...instrutores].sort((a,b)=>a.nome.localeCompare(b.nome)).map(i=><option key={i.id} value={i.id}>{i.nome}</option>)}</select></label>
    <label className="text-sm">De<input type="date" min={today} value={from} className={field} onChange={e=>{invalidate();setFrom(e.target.value);}}/></label><label className="text-sm">Até<input type="date" min={from||today} value={to} className={field} onChange={e=>{invalidate();setTo(e.target.value);}}/></label>
    <button type="button" className={primary} disabled={!instructor||busy} onClick={load}>{busy?'Consultando…':data?'Atualizar agenda':'Consultar agenda'}</button>
   </fieldset>
   {data&&<>
    <section className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Horários considerados na simulação">
     <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Quais horários considerar?</h3><p className="mt-1 text-xs text-slate-500">{mode==='suggestion'?reference.source:'Horários escolhidos por você · somente nesta simulação'}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={mode==='suggestion'} className={mode==='suggestion'?primary:button} onClick={()=>setMode('suggestion')}>Sugestão do sistema</button><button type="button" aria-pressed={mode==='custom'} className={mode==='custom'?primary:button} onClick={()=>setMode('custom')}>Escolher meus horários</button></div>
     </div>
     {mode==='suggestion'&&reference.historicalDays.length>0&&<p className="mt-2 text-xs text-slate-500">Dias incluídos pelo histórico: {reference.historicalDays.map(d=>weekdayNames[d]).join(', ')}. Os horários podem ser ajustados nesta simulação.</p>}
     {mode==='custom'&&<div className="mt-4 space-y-3"><PlanningPeriodGroups groups={groups} onChange={setGroups} disabled={busy}/>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={exact} onChange={e=>setExact(e.target.checked)}/><span>Permitir exceção aos intervalos cadastrados, somente nesta simulação.</span></label>{exact&&<p className="text-xs text-amber-800 dark:text-amber-200">Os horários escolhidos serão considerados por inteiro. Combine essa exceção com o instrutor. Aulas, eventos e dias bloqueados continuam sendo respeitados.</p>}
     </div>}
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
     <section className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">{freeDays} dias com turno disponível</h3><p className="text-xs text-slate-500">Agenda consultada em {format(new Date(data.loadedAt),'dd/MM HH:mm')}.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOptions} onChange={e=>setOnlyOptions(e.target.checked)}/>Somente dias disponíveis</label></div>
      {result.validation?<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{result.validation}</p>:!visible.length?<p className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-slate-800">Nenhum turno inteiro livre nessas condições. Você pode escolher outros horários acima ou desmarcar “Somente dias disponíveis” para consultar os compromissos.</p>:<div className="space-y-3">{visible.map(day=><article key={day.data} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h4 className="mb-3 font-bold capitalize">{dateLabel(day.data)}</h4>{day.bloqueios.length>0?<p className="text-sm text-rose-700 dark:text-rose-300">{day.bloqueios.join(' · ')}</p>:!day.turnos.length?<p className="text-sm text-slate-500">Sem turno sugerido para este dia. Use “Escolher meus horários” para considerar outra possibilidade.</p>:<div className="flex flex-wrap gap-2">{day.turnos.map(t=><div key={`${t.inicio}:${t.fim}`} className={`flex min-w-56 flex-1 items-center justify-between gap-3 rounded-lg border p-3 ${t.status==='disponivel'?'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950':'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}><div><p className="font-bold">{t.nome} · {t.inicio}–{t.fim}</p><p className="mt-1 text-sm">{t.status==='disponivel'?'Disponível':t.status==='simulado'?'Na simulação':'Ocupado'}</p></div><button type="button" className={t.status==='disponivel'?primary:button} disabled={busy||t.status!=='disponivel'} onClick={()=>add(t)}>{t.status==='simulado'?'Adicionado':'Simular'}</button></div>)}</div>}{day.ocupacoes.length>0&&<details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Ver compromissos</summary><ul className="mt-2 space-y-1">{day.ocupacoes.map(o=><li key={o.id}>{o.diaInteiro?'Dia inteiro':`${o.inicio.slice(0,5)}–${o.fim.slice(0,5)}`} · {o.descricao}</li>)}</ul></details>}</article>)}</div>}
     </section>
     <aside className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-bold">Rascunho · {simulated.length} turnos</h3>{!simulated.length?<p className="mt-2 text-sm text-slate-500">Clique em Simular nos turnos que quiser planejar.</p>:<ul className="mt-3 space-y-3">{simulated.map((s,index)=><li key={`${s.data}:${s.inicio}:${s.fim}`} className="border-b border-slate-100 pb-3 text-sm dark:border-slate-700"><div className="flex justify-between gap-2"><span>{dateLabel(s.data)}<br/><strong>{s.inicio}–{s.fim}</strong></span><button type="button" className="text-rose-700 dark:text-rose-300" aria-label={`Retirar período de ${s.data} às ${s.inicio}`} onClick={()=>setSimulated(previous=>previous.filter((_,i)=>i!==index))}>Retirar</button></div>{s.excecao&&<p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Exceção aos intervalos cadastrados</p>}{draftConflicts[index]&&<p className="mt-1 text-xs text-rose-700 dark:text-rose-300">Rever este período: há conflito com a agenda ou os intervalos considerados.</p>}</li>)}</ul>}<p className="mt-3 text-xs text-slate-500">Esta é uma simulação. Não cria aulas nem reserva horários. Atualizar a agenda mantém o rascunho e confere os conflitos novamente.</p></aside>
    </div>
    <p className="mt-4 text-xs text-slate-500">A sugestão é uma referência para planejar. Você pode escolher outros horários sem alterar o cadastro do instrutor. Salas serão verificadas ao cadastrar as aulas. Fechar esta tela ou trocar o instrutor encerra o rascunho.</p>
   </>}
  </div></div>
 </dialog>;
}
