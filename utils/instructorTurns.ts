import { computeInstructorPlanning, mergePlanningIntervals, planningMinutes, planningTime, suggestInstructorRoutine } from './instructorPlanning';
import type { PlanningBooking, PlanningBlock, PlanningSlot, RoutineWindow } from './instructorPlanning';

export interface PlanningTurn extends PlanningSlot { status:'disponivel'|'ocupado'|'simulado'; nome:string; motivo:string }
export interface PlanningTurnDay { data:string; turnos:PlanningTurn[]; bloqueios:string[]; ocupacoes:PlanningBooking[] }
export interface WorkPeriodGroup { dias:number[]; periodos:Array<{inicio:string;fim:string}> }
export function groupWorkPeriods(windows:RoutineWindow[]):WorkPeriodGroup[]{
    const groups=new Map<string,WorkPeriodGroup>();
    for(const dia of [1,2,3,4,5,6,0]){
        const periodos=windows.filter(w=>w.dia===dia).map(({inicio,fim})=>({inicio,fim})).sort((a,b)=>a.inicio.localeCompare(b.inicio));
        if(!periodos.length)continue;const key=JSON.stringify(periodos);
        if(groups.has(key))groups.get(key)!.dias.push(dia);else groups.set(key,{dias:[dia],periodos});
    }
    return [...groups.values()];
}
export const workPeriodsFromGroups=(groups:WorkPeriodGroup[]):RoutineWindow[]=>groups.flatMap(g=>g.dias.flatMap(dia=>g.periodos.map(p=>({dia,...p}))));
export function assignWorkDay(groups:WorkPeriodGroup[],index:number,dia:number,enabled:boolean):WorkPeriodGroup[]{
    return groups.map((g,i)=>({...g,dias:i===index?(enabled?[...new Set([...g.dias,dia])]:g.dias.filter(d=>d!==dia)):enabled?g.dias.filter(d=>d!==dia):g.dias}));
}
export function suggestedWorkPeriods(saved:RoutineWindow[],history:PlanningBooking[],from:string,to:string){
    const suggested=suggestInstructorRoutine(history,from,to);
    const dates=new Map<string,Array<[number,number]>>();
    for(const b of history){const d=new Date(`${b.data}T12:00:00`),a=planningMinutes(b.inicio),z=planningMinutes(b.fim);
        if(!b.diaInteiro&&b.data>=from&&b.data<=to&&Number.isFinite(d.getTime())&&Number.isFinite(a)&&Number.isFinite(z)&&z>a)dates.set(b.data,[...(dates.get(b.data)||[]),[a,z]]);
    }
    const windows=[...saved],historicalDays:number[]=[];
    for(const dia of [1,2,3,4,5,6,0]){
        if(saved.some(w=>w.dia===dia))continue;
        let inferred=suggested.windows.filter(w=>w.dia===dia);
        if(!inferred.length){
            // Horários variáveis ou só uma ocorrência não devem apagar o dia observado.
            const patterns=new Map<string,{count:number;last:string;parts:Array<[number,number]>}>();
            for(const [date,intervals]of dates)if(new Date(`${date}T12:00:00`).getDay()===dia){
                const parts=mergePlanningIntervals(intervals).filter(([a,b])=>b-a>=30);if(!parts.length)continue;
                const key=JSON.stringify(parts),old=patterns.get(key);patterns.set(key,{count:(old?.count||0)+1,last:old&&old.last>date?old.last:date,parts});
            }
            const best=[...patterns.values()].sort((a,b)=>b.count-a.count||b.last.localeCompare(a.last))[0];
            inferred=(best?.parts||[]).map(([a,b])=>({dia,inicio:planningTime(a),fim:planningTime(b)}));
        }
        // Fragmentos de disciplinas no mesmo turno não são novos turnos nem pausas de trabalho.
        const byTurn=new Map<string,RoutineWindow>();
        for(const w of inferred){const a=planningMinutes(w.inicio),b=planningMinutes(w.fim);
            const key=b<=720?'manha':a>=1080?'noite':a>=720&&b<=1080?'tarde':`${w.inicio}-${w.fim}`;
            const old=byTurn.get(key);byTurn.set(key,old?{dia,inicio:old.inicio<w.inicio?old.inicio:w.inicio,fim:old.fim>w.fim?old.fim:w.fim}:w);
        }
        const additions=[...byTurn.values()].sort((a,b)=>a.inicio.localeCompare(b.inicio)).slice(0,Math.min(4,28-windows.length));
        if(additions.length){windows.push(...additions);historicalDays.push(dia);}
    }
    if(windows.length)return{windows,source:saved.length?(historicalDays.length?'Referência cadastrada + dias do histórico':'Referência cadastrada'):'Sugestão pelo histórico · ajustável',historicalDays};
    return{windows:[1,2,3,4,5].flatMap(dia=>[{dia,inicio:'08:00',fim:'12:00'},{dia,inicio:'13:00',fim:'17:00'}]),source:'Referência inicial · ajuste se necessário',historicalDays};
}
export function protectedWorkBreaks(routine:RoutineWindow[],pauses:RoutineWindow[]):RoutineWindow[]{
    const result=[...pauses];
    for(let dia=0;dia<7;dia++){
        const parts=mergePlanningIntervals(routine.filter(w=>w.dia===dia).map(w=>[planningMinutes(w.inicio),planningMinutes(w.fim)]));
        for(let i=0;i<parts.length-1;i++)if(parts[i][1]<parts[i+1][0])result.push({dia,inicio:planningTime(parts[i][1]),fim:planningTime(parts[i+1][0]),descricao:'Intervalo entre turnos'});
    }
    // Mesclar protege também refeições que cruzam a separação entre turnos.
    return Array.from({length:7},(_,dia)=>mergePlanningIntervals(result.filter(p=>p.dia===dia).map(p=>[planningMinutes(p.inicio),planningMinutes(p.fim)]))
        .map(([a,b])=>({dia,inicio:planningTime(a),fim:planningTime(b),descricao:'Intervalo cadastrado'}))).flat();
}
const contains=(slots:PlanningSlot[],a:number,b:number)=>slots.some(s=>planningMinutes(s.inicio)<=a&&planningMinutes(s.fim)>=b);
const name=(a:number,b:number)=>b<=720?'Manhã':a>=1080?'Noite':a>=720&&b<=1080?'Tarde':'Período';
export function computeInstructorTurns(input:{from:string;to:string;windows:RoutineWindow[];pauses:RoutineWindow[];bookings:PlanningBooking[];blocks:PlanningBlock[];simulated:PlanningSlot[];now?:Date}):PlanningTurnDay[]{
    const args={from:input.from,to:input.to,routine:input.windows,breaks:input.pauses,bookings:input.bookings,blocks:input.blocks,exploreStart:'00:00',exploreEnd:'23:59',duration:15,now:input.now};
    const actual=computeInstructorPlanning({...args,simulated:[]}),planned=computeInstructorPlanning({...args,simulated:input.simulated});
    return actual.map((day,index)=>{
        const weekday=new Date(`${day.data}T12:00:00`).getDay();
        const turnos:PlanningTurn[]=[];
        for(const w of input.windows.filter(w=>w.dia===weekday)){
            let parts:[number,number][]=[[planningMinutes(w.inicio),planningMinutes(w.fim)]];
            for(const p of day.pausas){const a=planningMinutes(p.inicio),b=planningMinutes(p.fim);parts=parts.flatMap(([x,y])=>{
                if(a>=y||b<=x)return[[x,y] as [number,number]];
                const r:[number,number][]=[];if(a>x)r.push([x,a]);if(b<y)r.push([b,y]);return r;
            });}
            for(const [a,b]of parts){
                const start=planningTime(a),end=planningTime(b);
                const realFree=!day.bloqueios.length&&contains(day.livres,a,b);
                const selected=input.simulated.some(s=>s.data===day.data&&s.inicio===start&&s.fim===end);
                const free=realFree&&contains(planned[index].livres,a,b);
                const status=realFree&&selected?'simulado':free?'disponivel':'ocupado';
                turnos.push({data:day.data,inicio:start,fim:end,habitual:true,status,nome:name(a,b),motivo:day.bloqueios[0]||(!realFree?'Há compromisso ou o período já começou':selected?'Adicionado ao rascunho':!free?'Sobrepõe outro período simulado':'')});
            }
        }
        turnos.sort((a,b)=>a.inicio.localeCompare(b.inicio));
        return{data:day.data,turnos,bloqueios:day.bloqueios,ocupacoes:day.ocupacoes};
    });
}
