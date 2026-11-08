import { shiftDateKey } from '../../../utils/turmaReschedule';
import { localDateKey } from '../../../utils/turmaChanges';
import type { RoutineWindow } from '../../../utils/instructorPlanning';
const today=localDateKey(new Date());
const mode=new URLSearchParams(location.search).get('mode');
const initial:RoutineWindow[]=[1,2,3,4,5].flatMap(dia=>[{dia,inicio:'08:00',fim:'12:00'},{dia,inicio:'13:00',fim:'17:00'}]);
let saved={janelas:initial,updated_at:new Date().toISOString()};
export const useSchedule=()=>({instrutores:[{id:'demo',nome:'Instrutor de demonstração'}],userProfile:{role:mode==='viewer'?'viewer':'admin'}});
export const instructorPlanningService={
 async load(_id:string,from:string,to:string){
  if(mode==='error')throw new Error('Não foi possível consultar toda a agenda. Nenhuma disponibilidade foi calculada.');
  const bookings=[{id:'a',data:from,inicio:'09:00',fim:'10:30',descricao:'Turma fictícia 001'},
   {id:'b',data:from,inicio:'10:00',fim:'11:00',descricao:'Disciplina da turma fictícia 001'},
   {id:'f',data:shiftDateKey(from,2),inicio:'00:00',fim:'00:00',descricao:'Férias fictícias',diaInteiro:true}].filter(b=>b.data<=to);
  const history=Array.from({length:35},(_,i)=>shiftDateKey(today,-i-1)).filter(d=>new Date(d+'T12:00:00').getDay()!==0&&new Date(d+'T12:00:00').getDay()!==6)
   .flatMap((data,i)=>[{id:`hist-a-${i}`,data,inicio:'08:00',fim:'12:00',descricao:'Agendamento fictício'},{id:`hist-b-${i}`,data,inicio:'13:00',fim:'17:00',descricao:'Agendamento fictício'}]);
  return{routine:saved,bookings,history,blocks:[{data:shiftDateKey(from,4),descricao:'Recesso fictício'}],loadedAt:new Date().toISOString(),historyFrom:shiftDateKey(today,-84),historyTo:shiftDateKey(today,-1),legacyCount:0};
 },
 async save(_id:string,janelas:RoutineWindow[],version:string|null){if(mode==='viewer')throw new Error('Sem permissão.');if(version!==saved.updated_at)throw new Error('Rotina alterada. Recarregue.');saved={janelas,updated_at:new Date().toISOString()};return saved;}
};
