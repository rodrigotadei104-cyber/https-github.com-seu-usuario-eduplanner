import React from 'react';
import {assignWorkDay} from '../utils/instructorTurns';
import type {WorkPeriodGroup} from '../utils/instructorTurns';
const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const field='mt-1 block rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-600';
export function PlanningPeriodGroups({groups,onChange,disabled}:{groups:WorkPeriodGroup[];onChange:(groups:WorkPeriodGroup[])=>void;disabled:boolean}){
 const edit=(index:number,change:Partial<WorkPeriodGroup>)=>onChange(groups.map((g,i)=>i===index?{...g,...change}:g));
 return <fieldset disabled={disabled} className="space-y-3"><legend className="sr-only">Horários por grupo de dias</legend>
  {groups.map((g,index)=><section key={index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
   <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-bold">{g.dias.length?g.dias.map(d=>names[d]).join(' · '):'Escolha os dias deste horário'}</h4>{groups.length>1&&<button type="button" className="text-xs text-rose-700 dark:text-rose-300" onClick={()=>onChange(groups.filter((_,i)=>i!==index))}>Remover grupo</button>}</div>
   <div className="flex flex-wrap gap-2">{[1,2,3,4,5,6,0].map(dia=><label key={dia} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-600"><input type="checkbox" aria-label={`${names[dia]} no grupo ${index+1}`} checked={g.dias.includes(dia)} onChange={e=>onChange(assignWorkDay(groups,index,dia,e.target.checked))}/>{names[dia]}</label>)}</div>
   <div className="mt-3 flex flex-wrap items-end gap-3">{g.periodos.map((p,period)=><div key={period} className="flex items-end gap-2"><label className="text-xs">Das<input type="time" aria-label={`Início ${period+1} do grupo ${index+1}`} value={p.inicio} className={field} onChange={e=>edit(index,{periodos:g.periodos.map((row,i)=>i===period?{...row,inicio:e.target.value}:row)})}/></label><label className="text-xs">Até<input type="time" aria-label={`Fim ${period+1} do grupo ${index+1}`} value={p.fim} className={field} onChange={e=>edit(index,{periodos:g.periodos.map((row,i)=>i===period?{...row,fim:e.target.value}:row)})}/></label>{g.periodos.length>1&&<button type="button" className={button} aria-label={`Remover período ${period+1} do grupo ${index+1}`} onClick={()=>edit(index,{periodos:g.periodos.filter((_,i)=>i!==period)})}>×</button>}</div>)}<button type="button" className={button} disabled={g.periodos.length>=4} onClick={()=>edit(index,{periodos:[...g.periodos,{inicio:'13:00',fim:'17:00'}]})}>+ Outro período</button></div>
  </section>)}
  <button type="button" className={button} disabled={groups.length>=7} onClick={()=>onChange([...groups,{dias:[],periodos:[{inicio:'08:00',fim:'12:00'},{inicio:'13:00',fim:'17:00'}]}])}>+ Dias com outro horário</button>
  <p className="text-xs text-slate-500">Cada grupo tem seus próprios horários. Ao marcar um dia em outro grupo, ele sai do grupo anterior.</p>
 </fieldset>;
}
