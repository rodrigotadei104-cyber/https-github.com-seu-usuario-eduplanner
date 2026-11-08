import React from 'react';
import type { RoutineWindow } from '../utils/instructorPlanning';

export const weekdayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const field='rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800';
export function RotinaInstrutorEditor({ windows, onChange, disabled, protectedBreaks=false }: { windows:RoutineWindow[];onChange:(value:RoutineWindow[])=>void;disabled:boolean;protectedBreaks?:boolean }) {
    return <div className="space-y-2">{[1,2,3,4,5,6,0].map(dia=><div key={dia} className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2 dark:border-slate-700">
        <strong className="w-20 text-sm">{weekdayNames[dia]}</strong>
        {windows.map((w,index)=>w.dia!==dia?null:<div key={index} className="flex items-center gap-1">
            <input type="time" aria-label={`${weekdayNames[dia]} início do intervalo ${index+1}`} value={w.inicio} disabled={disabled} className={field} onChange={e=>onChange(windows.map((row,i)=>i===index?{...row,inicio:e.target.value}:row))}/><span>–</span>
            <input type="time" aria-label={`${weekdayNames[dia]} fim do intervalo ${index+1}`} value={w.fim} disabled={disabled} className={field} onChange={e=>onChange(windows.map((row,i)=>i===index?{...row,fim:e.target.value}:row))}/>
            {protectedBreaks&&<input type="text" aria-label={`Descrição da pausa ${index+1} de ${weekdayNames[dia]}`} maxLength={120} value={w.descricao||''} placeholder="Janta, almoço…" disabled={disabled} className={`${field} w-28`} onChange={e=>onChange(windows.map((row,i)=>i===index?{...row,descricao:e.target.value}:row))}/>}
            <button type="button" disabled={disabled} aria-label={`Remover intervalo ${index+1} de ${weekdayNames[dia]}`} onClick={()=>onChange(windows.filter((_,i)=>i!==index))} className="rounded px-2 py-1 text-sm text-rose-700 dark:text-rose-300">×</button>
        </div>)}
        <button type="button" disabled={disabled||windows.length>=28} onClick={()=>onChange([...windows,protectedBreaks?{dia,inicio:'18:00',fim:'19:00',descricao:'Janta'}:{dia,inicio:windows.some(w=>w.dia===dia)?'13:00':'08:00',fim:windows.some(w=>w.dia===dia)?'17:00':'12:00'}])} className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600">{protectedBreaks?'+ Pausa':'+ Intervalo'}</button>
    </div>)}</div>;
}
