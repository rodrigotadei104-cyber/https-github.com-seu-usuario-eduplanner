-- Additive: existing opening, simulation and editing flows are unchanged.
create function public.consultar_base_cronograma(p_curso uuid,p_instrutor uuid,p_inicio date,p_fim date,p_sala text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u public.users%rowtype; c public.catalogo_cursos%rowtype; planning jsonb;
begin
 select * into u from public.users where id=auth.uid();
 if u.id is null or u.status::text<>'active' or u.role::text not in ('admin','editor','viewer') then raise exception 'Sem permissão para consultar o planejamento.'; end if;
 select * into c from public.catalogo_cursos where id=p_curso and tenant_id=u.tenant_id and ativo is true;
 if c.id is null then raise exception 'Curso indisponível nesta unidade.'; end if;
 planning:=public.consultar_planejamento_instrutor(p_instrutor,p_inicio,p_fim);
 -- Be conservative with older records: spaces/case in a name and a NULL status
 -- cannot turn an existing booking into apparent availability in the new flow.
 planning:=jsonb_set(planning,'{aulas}',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'data',a.data,'inicio',a.horario_inicio,'fim',a.horario_fim,
 'descricao',coalesce(nullif(a.numero_turma,''),a.nome_materia,a.nome_curso,'Aula'),'legacy',a.instrutor_id is null) order by a.data,a.horario_inicio,a.id)
 from public.aulas a join public.instrutores i on i.id=p_instrutor and i.tenant_id=u.tenant_id
 where a.tenant_id=u.tenant_id and a.data between p_inicio and p_fim and a.status::text is distinct from 'cancelada'
 and (a.instrutor_id=i.id or (a.instrutor_id is null and lower(btrim(a.nome_instrutor))=lower(btrim(i.nome))))),'[]'::jsonb));
 return jsonb_build_object('curso',to_jsonb(c),'planejamento',planning,
 'disciplinas',coalesce((select jsonb_agg(to_jsonb(d) order by d.ordem nulls last,d.id) from public.disciplinas_curso d where d.curso_id=c.id and d.tenant_id=u.tenant_id),'[]'::jsonb),
 'sala',coalesce((select jsonb_agg(x.item order by x.data,x.id) from (
 select a.data,a.id::text,jsonb_build_object('id',a.id,'data',a.data,'inicio',a.horario_inicio,'fim',a.horario_fim,'descricao','Sala ocupada') item
 from public.aulas a where a.tenant_id=u.tenant_id and a.data between p_inicio and p_fim and a.status::text is distinct from 'cancelada'
 and nullif(btrim(p_sala),'') is not null and lower(btrim(a.sala))=lower(btrim(p_sala))
 union all
 select e.date,e.id::text,jsonb_build_object('id',e.id,'data',e.date,'inicio',e.start_time,'fim',e.end_time,'descricao','Evento na sala')
 from public.events e where e.tenant_id=u.tenant_id and e.date between p_inicio and p_fim and e.status is distinct from 'cancelado'
 and nullif(btrim(p_sala),'') is not null and lower(btrim(e.room))=lower(btrim(p_sala))
 ) x),'[]'::jsonb));
end $$;
revoke all on function public.consultar_base_cronograma(uuid,uuid,date,date,text) from public,anon;
grant execute on function public.consultar_base_cronograma(uuid,uuid,date,date,text) to authenticated;

create policy course_planning_audit_insert on public.audit_logs for insert to authenticated with check (
 user_id=(select auth.uid()) and action='CREATE' and entity='turma' and result='success'
 and details->>'type'='COURSE_SCHEDULE_CREATE'
 and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.tenant_id=audit_logs.tenant_id
 and u.status::text='active' and u.role::text in ('admin','editor') and u.email=audit_logs.user_email and u.role::text=audit_logs.user_role)
);

create function public.criar_turma_planejada(p_pedido jsonb,p_aplicar boolean default false,p_expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
declare
 u public.users%rowtype; c public.catalogo_cursos%rowtype; i public.instrutores%rowtype; existing public.turmas%rowtype;
 v_turma uuid; v_numero text; v_sala text; v_inicio date; v_fim date; mph integer; n integer; changed integer;
 subjects jsonb; lessons jsonb; saved_lessons jsonb; snapshot jsonb; planning jsonb;
 now_local timestamp := clock_timestamp() at time zone 'America/Sao_Paulo';
begin
 select * into u from public.users where id=auth.uid();
 if u.id is null or u.status::text<>'active' or u.role::text not in ('admin','editor') then raise exception 'Você não tem permissão para criar turmas e aulas.'; end if;
 if jsonb_typeof(p_pedido) is distinct from 'object' or p_aplicar is null then raise exception 'Pedido de planejamento inválido.'; end if;
 v_turma:=(p_pedido->>'id')::uuid; v_numero:=btrim(p_pedido->>'numero'); v_sala:=btrim(p_pedido->>'sala');
 v_inicio:=(p_pedido->>'inicioBusca')::date; v_fim:=(p_pedido->>'fimBusca')::date;
 if v_turma is null or nullif(v_numero,'') is null or length(v_numero)>80 or nullif(v_sala,'') is null or length(v_sala)>160 then raise exception 'Informe número da turma e sala antes de confirmar.'; end if;
 if v_inicio is null or v_fim is null or v_inicio<now_local::date or v_fim<v_inicio or v_fim-v_inicio>179 then raise exception 'Consulte um período futuro de até 180 dias.'; end if;
 if jsonb_typeof(p_pedido->'aulas') is distinct from 'array' then raise exception 'Gere uma proposta de aulas.'; end if;
 n:=jsonb_array_length(p_pedido->'aulas');
 if n not between 1 and 500 then raise exception 'A proposta deve conter de 1 a 500 aulas.'; end if;
 if exists(select 1 from jsonb_array_elements(p_pedido->'aulas') a where jsonb_typeof(a) is distinct from 'object'
 or coalesce(a->>'data','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(a->>'inicio','') !~ '^([01]\d|2[0-3]):[0-5]\d$'
 or coalesce(a->>'fim','') !~ '^([01]\d|2[0-3]):[0-5]\d$' or nullif(a->>'disciplinaId','') is null) then raise exception 'Há datas ou horários inválidos na proposta.'; end if;
 select jsonb_agg(jsonb_build_object('data',a.data,'inicio',a.inicio,'fim',a.fim,'disciplinaId',a."disciplinaId") order by a.data,a.inicio,a.fim,a."disciplinaId") into lessons
 from jsonb_to_recordset(p_pedido->'aulas') a(data date,inicio time,fim time,"disciplinaId" uuid);

 if p_aplicar then
  -- Old single-class writers do not acquire advisory locks. These short table locks
  -- also serialize them while the final conflict check and inserts run. Readers proceed.
  -- On contention abort in 3s, preserving the draft and all existing data.
  lock table public.aulas,public.events,public.turmas in share row exclusive mode;
  lock table public.catalogo_cursos,public.disciplinas_curso,public.instrutor_rotinas,public.feriados,public.datas_bloqueadas in share mode;
  now_local:=clock_timestamp() at time zone 'America/Sao_Paulo';
  select * into existing from public.turmas where id=v_turma and tenant_id=u.tenant_id;
  if existing.id is not null then
   select jsonb_agg(jsonb_build_object('data',a.data,'inicio',a.horario_inicio,'fim',a.horario_fim,'disciplinaId',a.disciplina_id) order by a.data,a.horario_inicio,a.horario_fim,a.disciplina_id) into saved_lessons
   from public.aulas a where a.tenant_id=u.tenant_id and a.turma_id=v_turma and a.instrutor_id=(p_pedido->>'instrutor')::uuid and a.sala=v_sala;
   if existing.numero_turma=v_numero and existing.curso_id=(p_pedido->>'curso')::uuid and existing.instrutor_id=(p_pedido->>'instrutor')::uuid
    and existing.sala_padrao=v_sala and saved_lessons=lessons and (select count(*) from public.aulas a where a.turma_id=v_turma and a.tenant_id=u.tenant_id)=n then
    return jsonb_build_object('applied',true,'turmaId',v_turma,'count',n,'snapshot',p_expected);
   end if;
   raise exception 'Este pedido já foi registrado. Confira a turma na agenda antes de criar outra.';
  end if;
 end if;
 select * into c from public.catalogo_cursos where id=(p_pedido->>'curso')::uuid and tenant_id=u.tenant_id and ativo is true;
 select * into i from public.instrutores where id=(p_pedido->>'instrutor')::uuid and tenant_id=u.tenant_id and active is not false;
 if c.id is null or i.id is null then raise exception 'Curso ou instrutor indisponível nesta unidade.'; end if;
 if coalesce(nullif(c.tipo_hora_min,''),'60') not in ('50','60') then raise exception 'Confira a duração da hora-aula no catálogo.'; end if;
 mph:=coalesce(nullif(c.tipo_hora_min,''),'60')::integer;
 select jsonb_agg(to_jsonb(d) order by d.ordem nulls last,d.id) into subjects from public.disciplinas_curso d where d.curso_id=c.id and d.tenant_id=u.tenant_id;
 if subjects is null or c.carga_total_horas is null or c.carga_total_horas<=0 or exists(select 1 from public.disciplinas_curso d where d.curso_id=c.id and d.tenant_id=u.tenant_id
 and (d.carga_horas is null or d.carga_horas<=0 or abs(d.carga_horas*mph-round(d.carga_horas*mph))>.000001))
 or abs(coalesce((select sum(d.carga_horas) from public.disciplinas_curso d where d.curso_id=c.id and d.tenant_id=u.tenant_id),0)-c.carga_total_horas)>.000001 then
  raise exception 'Confira a carga total e as disciplinas no catálogo.';
 end if;
 if exists(select 1 from jsonb_to_recordset(lessons) a(data date,inicio time,fim time,"disciplinaId" uuid)
 where a.data<v_inicio or a.data>v_fim or a.inicio>=a.fim or a.data+a.inicio<=now_local
 or not exists(select 1 from public.disciplinas_curso d where d.id=a."disciplinaId" and d.curso_id=c.id and d.tenant_id=u.tenant_id)) then raise exception 'Há aula passada, fora da busca ou de outra disciplina.'; end if;
 if exists(select 1 from public.disciplinas_curso d where d.curso_id=c.id and d.tenant_id=u.tenant_id and
 abs(coalesce((select sum(extract(epoch from (a.fim-a.inicio))/60) from jsonb_to_recordset(lessons) a(inicio time,fim time,"disciplinaId" uuid) where a."disciplinaId"=d.id),0)-d.carga_horas*mph)>.000001) then raise exception 'A carga distribuída deve corresponder à carga de cada disciplina.'; end if;
 if exists(select 1 from jsonb_array_elements(lessons) with ordinality a(x,n) join jsonb_array_elements(lessons) with ordinality b(x,n)
 on a.n<b.n and a.x->>'data'=b.x->>'data' and (a.x->>'inicio')::time<(b.x->>'fim')::time and (a.x->>'fim')::time>(b.x->>'inicio')::time) then raise exception 'Há aulas sobrepostas na proposta.'; end if;
 if exists(select 1 from public.turmas t where t.tenant_id=u.tenant_id and lower(btrim(t.numero_turma))=lower(v_numero))
 or exists(select 1 from public.aulas a where a.tenant_id=u.tenant_id and lower(btrim(a.numero_turma))=lower(v_numero)) then raise exception 'Este número de turma já existe na unidade. Escolha outro número.'; end if;
 planning:=public.consultar_planejamento_instrutor(i.id,v_inicio,v_fim);
 snapshot:=jsonb_build_object('curso',to_jsonb(c),'disciplinas',subjects,'instrutor',to_jsonb(i),'rotina',planning->'routine',
 'numero',v_numero,'sala',v_sala,'aulas',lessons,'inicioBusca',v_inicio,'fimBusca',v_fim);
 if p_aplicar and (p_expected is null or snapshot is distinct from p_expected) then raise exception 'O curso, os horários ou a referência do instrutor mudaram. Gere uma nova conferência.'; end if;
 if exists(select 1 from jsonb_to_recordset(lessons) a(data date,inicio time,fim time) join public.aulas b on b.tenant_id=u.tenant_id and b.data=a.data
 where b.status::text is distinct from 'cancelada' and (b.instrutor_id=i.id or (b.instrutor_id is null and lower(btrim(b.nome_instrutor))=lower(btrim(i.nome))) or lower(btrim(b.sala))=lower(v_sala))
 and (b.horario_inicio is null or b.horario_fim is null or b.horario_fim<=b.horario_inicio or (b.horario_inicio<a.fim and b.horario_fim>a.inicio))) then raise exception 'Há conflito de instrutor ou sala com outra aula. Atualize a proposta.'; end if;
 if exists(select 1 from jsonb_to_recordset(lessons) a(data date,inicio time,fim time) join public.events e on e.tenant_id=u.tenant_id and e.date=a.data
 where e.status is distinct from 'cancelado' and (e.instructor_id=i.id or lower(btrim(e.room))=lower(v_sala))
 and ((e.instructor_id=i.id and e.type='ferias') or e.start_time is null or e.end_time is null or e.end_time<=e.start_time or (e.start_time<a.fim and e.end_time>a.inicio))) then raise exception 'Há evento ou férias no horário proposto. Atualize a proposta.'; end if;
 if exists(select 1 from jsonb_to_recordset(lessons) a(data date,inicio time,fim time) join jsonb_array_elements(planning->'eventos') e on (e->>'data')::date=a.data
 where (e->>'protegido')::boolean is true and (e->>'inicio')::time<a.fim and (e->>'fim')::time>a.inicio) then raise exception 'Há aula durante um intervalo protegido do instrutor.'; end if;
 if exists(select 1 from jsonb_to_recordset(lessons) a(data date) join public.feriados f on f.tenant_id=u.tenant_id and f.data=a.data where f.ativo is true)
 or exists(select 1 from jsonb_to_recordset(lessons) a(data date) join public.datas_bloqueadas b on b.tenant_id=u.tenant_id and b.data=a.data where b.ativo is true) then raise exception 'Há feriado ou bloqueio nas datas propostas. Atualize a proposta.'; end if;
 if not p_aplicar then return jsonb_build_object('applied',false,'turmaId',null,'count',n,'snapshot',snapshot); end if;
 insert into public.turmas(id,tenant_id,numero_turma,curso_id,instrutor_id,sala_padrao,data_inicio,dias_semana_selecionados,horarios_do_dia,status)
 values(v_turma,u.tenant_id,v_numero,c.id,i.id,v_sala,(select min(a.data) from jsonb_to_recordset(lessons) a(data date)),array[]::integer[],'[]'::jsonb,'planejada');
 insert into public.aulas(id,tenant_id,turma_id,disciplina_id,instrutor_id,numero_turma,sala,data,horario_inicio,horario_fim,status,auto_gerada,carga_horaria_materia,nome_curso,nome_materia,nome_instrutor)
 select gen_random_uuid(),u.tenant_id,v_turma,a."disciplinaId",i.id,v_numero,v_sala,a.data,a.inicio,a.fim,'agendada',true,
 round(extract(epoch from (a.fim-a.inicio))/60/mph,6),c.nome_curso,d.nome_disciplina,i.nome
 from jsonb_to_recordset(lessons) a(data date,inicio time,fim time,"disciplinaId" uuid) join public.disciplinas_curso d on d.id=a."disciplinaId" and d.tenant_id=u.tenant_id and d.curso_id=c.id;
 get diagnostics changed=row_count;
 if changed<>n then raise exception 'Não foi possível criar todas as aulas. A operação foi revertida.'; end if;
 insert into public.audit_logs(tenant_id,user_id,user_email,user_role,action,entity,entity_id,details,result)
 values(u.tenant_id,u.id,u.email,u.role::text,'CREATE','turma',v_turma,jsonb_build_object('type','COURSE_SCHEDULE_CREATE','count',n,'proposal',snapshot),'success');
 return jsonb_build_object('applied',true,'turmaId',v_turma,'count',changed,'snapshot',snapshot);
end $$;
revoke all on function public.criar_turma_planejada(jsonb,boolean,jsonb) from public,anon;
grant execute on function public.criar_turma_planejada(jsonb,boolean,jsonb) to authenticated;
