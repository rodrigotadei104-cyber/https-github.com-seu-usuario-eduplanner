import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async(path,prefix='')=>{
 const src=readFileSync(new URL(path,import.meta.url),'utf8');const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(prefix+code.replace(/^import .*;\r?\n/gm,'')).toString('base64')}`);
};
const turma=await load('../utils/turmaChanges.ts');
globalThis.planningDeps={localDateKey:turma.localDateKey};
const dateUtils=await load('../utils/turmaReschedule.ts','const {localDateKey}=globalThis.planningDeps;\n');
globalThis.planningDeps={...globalThis.planningDeps,validDateKey:dateUtils.validDateKey};
const h=await load('../utils/instructorPlanning.ts','const {localDateKey,validDateKey}=globalThis.planningDeps;\n');
const base={from:'2026-11-09',to:'2026-11-09',routine:[{dia:1,inicio:'08:00',fim:'12:00'},{dia:1,inicio:'13:00',fim:'17:00'}],
 bookings:[],blocks:[],simulated:[],exploreStart:'06:00',exploreEnd:'22:00',duration:60,now:new Date(2026,10,8,12)};
const booking=(id,inicio,fim,rest={})=>({id,data:'2026-11-09',inicio,fim,descricao:'Aula',...rest});
let result=h.computeInstructorPlanning({...base,bookings:[booking('1','09:00','10:00'),booking('2','09:30','11:00'),booking('3','14:00','15:00')]})[0];
assert.deepEqual(result.livres.map(s=>[s.inicio,s.fim]),[['08:00','09:00'],['11:00','12:00'],['13:00','14:00'],['15:00','17:00']]);
assert.deepEqual(result.alternativas.map(s=>[s.inicio,s.fim]),[['06:00','08:00'],['17:00','22:00']]);
assert.equal(h.validateRoutine([{dia:1,inicio:'08:00',fim:'12:00'},{dia:1,inicio:'11:00',fim:'13:00'}])!==null,true);
assert.equal(h.computeInstructorPlanning({...base,blocks:[{data:base.from,descricao:'Feriado'}]})[0].alternativas.length,0);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('f','00:00','00:00',{diaInteiro:true})]})[0].livres.length,0);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('erro','','')]})[0].livres.length,0);
assert.equal(h.computeInstructorPlanning({...base,routine:[]})[0].livres.length,0);
assert.deepEqual(h.computeInstructorPlanning({...base,simulated:[{data:base.from,inicio:'08:00',fim:'10:00',habitual:true}]})[0].livres[0],{data:base.from,inicio:'10:00',fim:'12:00',habitual:true,comportaBloco:true});
assert.equal(h.computeInstructorPlanning({...base,now:new Date(2026,10,9,10,30)})[0].livres[0].inicio,'10:31');
assert.throws(()=>h.planningDates('2026-01-01','2026-12-31'),/180/);
assert.deepEqual(h.planningDates('9999-12-31','9999-12-31'),['9999-12-31']);
assert.equal(h.computeInstructorPlanning({...base,bookings:[booking('seconds','08:00:00','09:00:30')]})[0].livres[0].inicio,'09:01');
assert.throws(()=>h.computeInstructorPlanning({...base,duration:0}),/duração/);
// Giovanna: a rotina pode ter apenas 3h/3h20 livres, enquanto o bloco padrão é 4h.
const giovanna=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:240,
 routine:[{dia:1,inicio:'13:00',fim:'16:20'},{dia:1,inicio:'19:00',fim:'22:00'}]})[0];
assert.deepEqual(giovanna.livres.map(s=>[s.inicio,s.fim,s.comportaBloco]),[['13:00','16:20',false],['19:00','22:00',false]]);
const smaller=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:180,
 routine:[{dia:1,inicio:'13:00',fim:'16:20'},{dia:1,inicio:'19:00',fim:'22:00'}]})[0];
assert.equal(smaller.livres.every(s=>s.comportaBloco),true);
const realJourney=[{dia:1,inicio:'13:00',fim:'17:00'},{dia:1,inicio:'18:00',fim:'22:00'}];
const meal=[{dia:1,inicio:'18:00',fim:'19:00',descricao:'Janta'}];
for(const duration of [50,180,240]){
 const d=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration,routine:realJourney,breaks:meal})[0];
 assert.deepEqual(d.livres.map(s=>[s.inicio,s.fim]),[['13:00','17:00'],['19:00','22:00']]);
 for(const s of [...d.livres,...d.alternativas])assert.equal(h.planningMinutes(s.inicio)<1140&&h.planningMinutes(s.fim)>1080,false,'janta não aparece dentro ou fora da rotina');
 assert.equal(d.pausas[0].descricao,'Janta');
}
const pedagogical=h.computeInstructorPlanning({...base,from:'2027-01-11',to:'2027-01-11',duration:50,routine:realJourney,breaks:meal,
 bookings:[{id:'50min',data:'2027-01-11',inicio:'19:00',fim:'21:30',descricao:'3 aulas de 50 minutos'}]})[0];
assert.equal(pedagogical.livres.some(s=>s.inicio==='18:00'),false);
assert.equal(pedagogical.livres.find(s=>s.inicio==='21:30').comportaBloco,false,'resíduo de 30 minutos não comporta aula de 50');
const history=[booking('a','08:00','10:00',{data:'2026-10-19'}),booking('b','10:00','12:00',{data:'2026-10-19'}),booking('c','09:00','13:00',{data:'2026-10-26'}),booking('d','19:00','21:00',{data:'2026-10-27'})];
assert.deepEqual(h.suggestInstructorRoutine(history,'2026-10-01','2026-10-31').windows,[{dia:1,inicio:'09:00',fim:'12:00'}]);
assert.equal(h.suggestInstructorRoutine(history.slice(0,2),'2026-10-01','2026-10-31').windows.length,0,'fragmentos no mesmo dia não são duas evidências');
// Propriedade: nenhum minuto devolvido pode colidir com ocupação; toda faixa livre útil deve ser preservada.
let seed=17;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
for(let test=0;test<80;test++){
 const intervals=Array.from({length:8},(_,i)=>{const a=480+Math.floor(random()*500),b=Math.min(1020,a+1+Math.floor(random()*90));return booking(String(i),h.planningTime(a),h.planningTime(b));});
 const output=h.computeInstructorPlanning({...base,routine:[{dia:1,inicio:'08:00',fim:'17:00'}],bookings:intervals,duration:15})[0];
 const occupied=new Set();intervals.forEach(b=>{for(let m=h.planningMinutes(b.inicio);m<h.planningMinutes(b.fim);m++)occupied.add(m);});
 const expected=new Set();let start=480;
 while(start<1020){if(occupied.has(start)){start++;continue;}let end=start;while(end<1020&&!occupied.has(end))end++;for(let m=start;m<end;m++)expected.add(m);start=end;}
 const actual=new Set();for(const s of output.livres)for(let m=h.planningMinutes(s.inicio);m<h.planningMinutes(s.fim);m++){assert.equal(occupied.has(m),false);actual.add(m);}
 assert.deepEqual(actual,expected);
}
globalThis.turnDeps=h;
const turns=await load('../utils/instructorTurns.ts','const {computeInstructorPlanning,mergePlanningIntervals,planningMinutes,planningTime,suggestInstructorRoutine}=globalThis.turnDeps;\n');
const turnsInput={from:'2027-01-11',to:'2027-01-11',windows:realJourney,pauses:turns.protectedWorkBreaks(realJourney,meal),bookings:[],blocks:[],simulated:[],now:base.now};
assert.deepEqual(turns.computeInstructorTurns(turnsInput)[0].turnos.map(t=>[t.inicio,t.fim,t.status]),[['13:00','17:00','disponivel'],['19:00','22:00','disponivel']]);
const booked=turns.computeInstructorTurns({...turnsInput,bookings:[{id:'class50',data:'2027-01-11',inicio:'13:00',fim:'16:20',descricao:'Aulas de 50 minutos'}]})[0];
assert.equal(booked.turnos[0].status,'ocupado');
assert.equal(booked.turnos.some(t=>t.inicio==='16:20'),false,'não oferece a sobra de 40 minutos como turno');
const draft=[{data:'2027-01-11',inicio:'13:00',fim:'17:00',habitual:true}];
assert.equal(turns.computeInstructorTurns({...turnsInput,simulated:draft})[0].turnos[0].status,'simulado');
assert.equal(turns.computeInstructorTurns({...turnsInput,simulated:draft,bookings:[{id:'new',data:'2027-01-11',inicio:'14:00',fim:'15:00',descricao:'Nova reserva'}]})[0].turnos[0].status,'ocupado','atualização não esconde conflito de um rascunho');
assert.equal(turns.computeInstructorTurns({...turnsInput,windows:[{dia:1,inicio:'07:00',fim:'11:00'}]})[0].turnos[0].status,'disponivel','pode escolher horário fora da sugestão');
assert.deepEqual(turns.computeInstructorTurns({...turnsInput,windows:[{dia:1,inicio:'18:00',fim:'22:00'}],pauses:[]})[0].turnos.map(t=>[t.inicio,t.fim]),[['18:00','22:00']],'exceção explícita usa exatamente o período escolhido');
assert.deepEqual(turns.computeInstructorTurns({...turnsInput,windows:[{dia:1,inicio:'18:00',fim:'22:00'}]})[0].turnos.map(t=>[t.inicio,t.fim]),[['19:00','22:00']],'por padrão refeições continuam consideradas');
assert.equal(turns.computeInstructorTurns({...turnsInput,blocks:[{data:'2027-01-11',descricao:'Feriado'}]})[0].turnos.every(t=>t.status==='ocupado'),true);
assert.deepEqual(turns.suggestedWorkPeriods(realJourney,history,'2026-10-01','2026-10-31').windows.filter(w=>w.dia===1),realJourney,'não altera horários cadastrados do mesmo dia');
assert.equal(turns.suggestedWorkPeriods([],history,'2026-10-01','2026-10-31').source,'Sugestão pelo histórico · ajustável');
assert.equal(turns.suggestedWorkPeriods([],[],'2026-10-01','2026-10-31').windows.length,10,'sem histórico não exige um cadastro para consultar');
const weekdays=[1,2,3,4,5].flatMap(dia=>[{dia,inicio:'07:30',fim:'11:30'},{dia,inicio:'13:00',fim:'17:00'}]);
const saturdays=['2026-10-24','2026-10-31','2026-11-07'].flatMap((data,i)=>[{id:`sat-am-${i}`,data,inicio:'08:00',fim:'12:00',descricao:'Aula sábado'},{id:`sat-pm-${i}`,data,inicio:'13:00',fim:'17:00',descricao:'Aula sábado'}]);
const proposal=turns.suggestedWorkPeriods(weekdays,saturdays,'2026-10-01','2026-11-07');
assert.deepEqual(proposal.windows.filter(w=>w.dia===6),[{dia:6,inicio:'08:00',fim:'12:00'},{dia:6,inicio:'13:00',fim:'17:00'}],'referência de seg-sex não apaga sábado do histórico');
assert.deepEqual(proposal.windows.filter(w=>w.dia!==6),weekdays);
assert.equal(proposal.historicalDays.includes(6),true);
assert.equal(turns.suggestedWorkPeriods([],saturdays.slice(0,2),'2026-10-01','2026-11-07').windows.some(w=>w.dia===6),true,'um sábado observado não desaparece por falta de repetição');
const changingSaturdays=[saturdays[0],saturdays[3]];
assert.equal(turns.suggestedWorkPeriods([],changingSaturdays,'2026-10-01','2026-11-07').windows.some(w=>w.dia===6),true,'sábado com horários variáveis continua sugerido');
const fragments=saturdays.map(s=>s.inicio==='13:00'?{...s,fim:'15:00'}:s).concat(saturdays.filter(s=>s.inicio==='13:00').map(s=>({...s,id:s.id+'tail',inicio:'16:00',fim:'17:00'})));
assert.deepEqual(turns.suggestedWorkPeriods(weekdays,fragments,'2026-10-01','2026-11-07').windows.filter(w=>w.dia===6),[{dia:6,inicio:'08:00',fim:'12:00'},{dia:6,inicio:'13:00',fim:'17:00'}],'fragmentos de aulas não criam vários turnos curtos nem pausa fictícia no sábado');
const grouped=turns.groupWorkPeriods(proposal.windows);
assert.equal(grouped.length,2);
assert.deepEqual(grouped[0].dias,[1,2,3,4,5]);assert.deepEqual(grouped[1].dias,[6]);
const editedGroups=grouped.map((g,i)=>i===1?{...g,periodos:[{inicio:'09:00',fim:'12:00'},{inicio:'13:00',fim:'17:00'}]}:g);
assert.deepEqual(turns.workPeriodsFromGroups(editedGroups).filter(w=>w.dia!==6),weekdays,'editar sábado preserva segunda a sexta');
const moved=turns.assignWorkDay([{dias:[1,2,3,4,5,6],periodos:grouped[0].periodos},{dias:[],periodos:grouped[1].periodos}],1,6,true);
assert.equal(moved[0].dias.includes(6),false);assert.deepEqual(moved[1].dias,[6]);
assert.equal(turns.workPeriodsFromGroups(moved).filter(w=>w.dia===6).length,2,'um dia não recebe horários de dois grupos por acidente');
let calls=[],allowed=true,error=null;
const reply={loaded_at:'2026-11-08T12:00:00Z',history_from:'2026-08-16',history_to:'2026-11-07',routine:null,aulas:[],historico:[],eventos:[],feriados:[],bloqueios:[]};
globalThis.planningServiceDeps={validateRoutine:h.validateRoutine,planningDates:h.planningDates,validDateKey:dateUtils.validDateKey,
 tenantService:{getCurrentTenantId:()=> 'T'},permissionService:{checkPermission:async()=>allowed},supabase:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='salvar_rotina_instrutor'?{janelas:args.p_janelas,pausas:args.p_pausas,updated_at:'2026-11-08T12:00:00Z'}:reply,error};}}};
const {instructorPlanningService:svc}=await load('../services/instructorPlanning.service.ts','const {validateRoutine,planningDates,validDateKey,tenantService,permissionService,supabase}=globalThis.planningServiceDeps;\n');
assert.equal((await svc.load('i',base.from,base.to)).routine.updated_at,null);
assert.equal(calls[0].name,'consultar_planejamento_instrutor');
await svc.save('i',realJourney,null,meal);
assert.deepEqual(calls.at(-1).args.p_pausas,meal);
reply.routine={janelas:realJourney,pausas:meal,updated_at:'2026-11-08T12:00:00Z'};
reply.eventos=[{id:'protected',data:'2026-11-09',inicio:'18:00',fim:'19:00',descricao:'Janta',protegido:true}];
const withBreak=await svc.load('i',base.from,base.to);
assert.deepEqual(withBreak.routine.pausas,meal);
assert.equal(withBreak.bookings.length,0,'pausa legada não duplica nem impede revisão explícita da configuração local');
allowed=false;const count=calls.length;await assert.rejects(()=>svc.save('i',[],null),/permissão/);assert.equal(calls.length,count);
error={code:'PGRST202'};await assert.rejects(()=>svc.load('i',base.from,base.to),/não está habilitado/);
error=null;reply.aulas=null;await assert.rejects(()=>svc.load('i',base.from,base.to),/incompleta/);
console.log('OK: disponibilidade, rotina, intervalos, exceções, bloqueios, histórico, propriedades aleatórias e falhas de consulta.');
