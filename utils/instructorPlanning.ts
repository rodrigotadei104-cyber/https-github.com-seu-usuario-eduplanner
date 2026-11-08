import { localDateKey } from './turmaChanges';
import { validDateKey } from './turmaReschedule';

export interface RoutineWindow { dia: number; inicio: string; fim: string }
export interface PlanningBooking { id: string; data: string; inicio: string; fim: string; descricao: string; diaInteiro?: boolean }
export interface PlanningBlock { data: string; descricao: string }
export interface PlanningSlot { data: string; inicio: string; fim: string; habitual: boolean }
export interface PlanningDay { data: string; livres: PlanningSlot[]; alternativas: PlanningSlot[]; ocupacoes: PlanningBooking[]; bloqueios: string[] }
export const planningMinutes = (value: string): number => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return NaN;
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
};
export const planningTime = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
type Interval = [number, number];
export function mergePlanningIntervals(values: Interval[]): Interval[] {
    const result: Interval[] = [];
    for (const [start, end] of [...values].sort((a,b)=>a[0]-b[0]||a[1]-b[1])) {
        if (end <= start) continue;
        const last = result.at(-1);
        if (last && start <= last[1]) last[1] = Math.max(last[1], end); else result.push([start,end]);
    }
    return result;
}
function subtract(windows: Interval[], occupied: Interval[]): Interval[] {
    let result = mergePlanningIntervals(windows);
    for (const [start,end] of mergePlanningIntervals(occupied)) result = result.flatMap(([a,b]) => {
        if (start >= b || end <= a) return [[a,b] as Interval];
        const parts: Interval[] = []; if(start>a)parts.push([a,start]);if(end<b)parts.push([end,b]);return parts;
    });
    return result;
}
export function validateRoutine(windows: RoutineWindow[]): string | null {
    if (!Array.isArray(windows) || windows.length > 28) return 'Use até 28 intervalos na semana.';
    for(const w of windows) if(!w||!Number.isInteger(w.dia)||w.dia<0||w.dia>6||typeof w.inicio!=='string'||typeof w.fim!=='string'||w.inicio.length!==5||w.fim.length!==5||!Number.isFinite(planningMinutes(w.inicio))
        ||!Number.isFinite(planningMinutes(w.fim))||planningMinutes(w.fim)<=planningMinutes(w.inicio)) return 'Revise os dias e horários da rotina. Cada intervalo deve terminar no mesmo dia, após o início.';
    for(let i=0;i<windows.length;i++)for(let j=i+1;j<windows.length;j++)if(windows[i].dia===windows[j].dia
        &&planningMinutes(windows[i].inicio)<planningMinutes(windows[j].fim)&&planningMinutes(windows[j].inicio)<planningMinutes(windows[i].fim))return 'Há intervalos sobrepostos na rotina.';
    return null;
}
export function planningDates(from: string,to: string): string[] {
    if(!validDateKey(from)||!validDateKey(to)||to<from)throw new Error('Informe um período válido.');
    const result:string[]=[];const date=new Date(`${from}T12:00:00`);
    while(localDateKey(date)<=to){result.push(localDateKey(date));if(result.length>180)throw new Error('Consulte até 180 dias por simulação.');if(localDateKey(date)===to)break;date.setDate(date.getDate()+1);}
    return result;
}
export function computeInstructorPlanning(input: { from:string;to:string;routine:RoutineWindow[];bookings:PlanningBooking[];blocks:PlanningBlock[];
    simulated:PlanningSlot[]; exploreStart:string;exploreEnd:string;duration:number;now?:Date }): PlanningDay[] {
    const {routine,bookings,blocks,simulated,duration}=input;const now=input.now||new Date();
    const invalid=validateRoutine(routine);if(invalid)throw new Error(invalid);
    const explore:Interval=[planningMinutes(input.exploreStart),planningMinutes(input.exploreEnd)];
    if(!explore.every(Number.isFinite)||explore[1]<=explore[0]||!Number.isInteger(duration)||duration<15||duration>720)throw new Error('Revise a faixa de consulta e a duração (15 a 720 minutos).');
    return planningDates(input.from,input.to).map(data=>{
        const day=new Date(`${data}T12:00:00`), today=localDateKey(now);
        const ocupacoes=bookings.filter(b=>b.data===data);const bloqueios=blocks.filter(b=>b.data===data).map(b=>b.descricao);
        if(ocupacoes.some(b=>b.diaInteiro))bloqueios.push('Férias ou afastamento de dia inteiro');
        if(ocupacoes.some(b=>!b.diaInteiro&&(!Number.isFinite(planningMinutes(b.inicio))||!Number.isFinite(planningMinutes(b.fim))||planningMinutes(b.fim)<=planningMinutes(b.inicio))))bloqueios.push('Compromisso com horário inválido; conferir agenda');
        if(data<today)bloqueios.push('Data passada');
        const busy:Interval[]=ocupacoes.filter(b=>!b.diaInteiro).map(b=>[planningMinutes(b.inicio),Math.min(1440,planningMinutes(b.fim)+(Number(b.fim.slice(6,8))>0?1:0))]);
        busy.push(...simulated.filter(b=>b.data===data).map(b=>[planningMinutes(b.inicio),planningMinutes(b.fim)] as Interval));
        if(data===today)busy.push([0,Math.min(1440,now.getHours()*60+now.getMinutes()+1)]);
        const routineDay:Interval[]=routine.filter(w=>w.dia===day.getDay()).map(w=>[planningMinutes(w.inicio),planningMinutes(w.fim)]);
        const make=(parts:Interval[],habitual:boolean)=>parts.filter(([a,b])=>b-a>=duration).map(([a,b])=>({data,inicio:planningTime(a),fim:planningTime(b),habitual}));
        return {data,ocupacoes,bloqueios,livres:bloqueios.length?[]:make(subtract(routineDay,busy),true),
            alternativas:bloqueios.length?[]:make(subtract([explore],[...busy,...routineDay]),false)};
    });
}
export function suggestInstructorRoutine(bookings:PlanningBooking[],from:string,to:string):{windows:RoutineWindow[];daysObserved:number} {
    const dates=new Map<string,Interval[]>();
    for(const b of bookings)if(validDateKey(b.data)&&b.data>=from&&b.data<=to&&!b.diaInteiro){
        const a=planningMinutes(b.inicio),z=planningMinutes(b.fim);if(Number.isFinite(a)&&Number.isFinite(z)&&z>a)dates.set(b.data,[...(dates.get(b.data)||[]),[a,z]]);
    }
    const windows:RoutineWindow[]=[];
    for(let dia=0;dia<7;dia++){
        const observed=[...dates].filter(([date])=>new Date(`${date}T12:00:00`).getDay()===dia);
        if(observed.length<2)continue;
        const support=new Uint16Array(1440);
        for(const [,parts]of observed)for(const [a,b]of mergePlanningIntervals(parts))for(let m=a;m<b;m++)support[m]++;
        const threshold=Math.max(2,Math.ceil(observed.length/2));let start=-1;
        for(let minute=0;minute<=1440;minute++){
            if(minute<1440&&support[minute]>=threshold){if(start<0)start=minute;}
            else if(start>=0){if(minute-start>=30&&minute<1440)windows.push({dia,inicio:planningTime(start),fim:planningTime(minute)});start=-1;}
        }
    }
    return {windows:windows.slice(0,28),daysObserved:dates.size};
}
