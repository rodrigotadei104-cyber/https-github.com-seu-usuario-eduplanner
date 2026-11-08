-- Rotina por unidade/instrutor; simulações não são gravadas como aulas.
create function public.validar_rotina_instrutor(p_janelas jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare w jsonb;
begin
 if jsonb_typeof(p_janelas) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_janelas)>28 then return false; end if;
 for w in select value from jsonb_array_elements(p_janelas) loop
 if jsonb_typeof(w) is distinct from 'object' or jsonb_typeof(w->'dia') is distinct from 'number'
 or (w->>'dia') !~ '^[0-6]$' or coalesce(w->>'inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(w->>'fim','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'fim'<=w->>'inicio' then return false; end if;
 end loop;
 return not exists(select 1 from jsonb_array_elements(p_janelas) with ordinality a(w,n)
 join jsonb_array_elements(p_janelas) with ordinality b(w,n) on a.n<b.n
 where a.w->>'dia'=b.w->>'dia' and a.w->>'inicio'<b.w->>'fim' and b.w->>'inicio'<a.w->>'fim');
end $$;
revoke all on function public.validar_rotina_instrutor(jsonb) from public,anon;
grant execute on function public.validar_rotina_instrutor(jsonb) to authenticated;

create table public.instrutor_rotinas (
 tenant_id uuid not null, instrutor_id uuid not null references public.instrutores(id),
 janelas jsonb not null default '[]'::jsonb check(public.validar_rotina_instrutor(janelas)),
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null,
 primary key(tenant_id,instrutor_id)
);
alter table public.instrutor_rotinas enable row level security;
grant select,insert,update on public.instrutor_rotinas to authenticated;
revoke all on public.instrutor_rotinas from public,anon;
create policy rotina_read on public.instrutor_rotinas for select to authenticated using(
 exists(select 1 from public.users u where u.id=(select auth.uid()) and u.tenant_id=instrutor_rotinas.tenant_id and u.status::text='active'));
create policy rotina_insert on public.instrutor_rotinas for insert to authenticated with check(
 updated_by=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid())
 and u.tenant_id=instrutor_rotinas.tenant_id and u.status::text='active' and u.role::text in ('admin','editor'))
 and exists(select 1 from public.instrutores i where i.id=instrutor_rotinas.instrutor_id and i.tenant_id=instrutor_rotinas.tenant_id and i.active is not false));
create policy rotina_update on public.instrutor_rotinas for update to authenticated using(
 exists(select 1 from public.users u where u.id=(select auth.uid()) and u.tenant_id=instrutor_rotinas.tenant_id and u.status::text='active' and u.role::text in ('admin','editor')))
 with check(updated_by=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid())
 and u.tenant_id=instrutor_rotinas.tenant_id and u.status::text='active' and u.role::text in ('admin','editor'))
 and exists(select 1 from public.instrutores i where i.id=instrutor_rotinas.instrutor_id and i.tenant_id=instrutor_rotinas.tenant_id and i.active is not false));
create policy rotina_audit_insert on public.audit_logs for insert to authenticated with check(
 user_id=(select auth.uid()) and action='UPDATE' and entity='instrutor_rotina' and result='success'
 and details->>'type'='INSTRUCTOR_ROUTINE' and exists(select 1 from public.users u where u.id=(select auth.uid())
 and u.tenant_id=audit_logs.tenant_id and u.status::text='active' and u.role::text in ('admin','editor')
 and u.email=audit_logs.user_email and u.role::text=audit_logs.user_role));

create function public.salvar_rotina_instrutor(p_instrutor uuid,p_janelas jsonb,p_version timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.users%rowtype; previous public.instrutor_rotinas%rowtype; saved public.instrutor_rotinas%rowtype;
begin
 select * into u from public.users where id=auth.uid();
 if u.id is null or u.status::text<>'active' or u.role::text not in ('admin','editor') then raise exception 'Sem permissão para salvar a rotina.'; end if;
 if not public.validar_rotina_instrutor(p_janelas) then raise exception 'Rotina inválida: revise horários e sobreposições.'; end if;
 if not exists(select 1 from public.instrutores i where i.id=p_instrutor and i.tenant_id=u.tenant_id and i.active is not false) then raise exception 'Instrutor indisponível nesta unidade.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('eduplanner-rotina:'||u.tenant_id::text||':'||p_instrutor::text,0));
 select * into previous from public.instrutor_rotinas where tenant_id=u.tenant_id and instrutor_id=p_instrutor for update;
 if previous.updated_at is distinct from p_version then raise exception 'A rotina foi alterada por outro usuário. Recarregue antes de salvar.'; end if;
 insert into public.instrutor_rotinas(tenant_id,instrutor_id,janelas,updated_by) values(u.tenant_id,p_instrutor,p_janelas,u.id)
 on conflict(tenant_id,instrutor_id) do update set janelas=excluded.janelas,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into saved;
 insert into public.audit_logs(tenant_id,user_id,user_email,user_role,action,entity,entity_id,details,result)
 values(u.tenant_id,u.id,u.email,u.role::text,'UPDATE','instrutor_rotina',p_instrutor,
 jsonb_build_object('type','INSTRUCTOR_ROUTINE','before',to_jsonb(previous),'after',to_jsonb(saved)),'success');
 return to_jsonb(saved);
end $$;
revoke all on function public.salvar_rotina_instrutor(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.salvar_rotina_instrutor(uuid,jsonb,timestamptz) to authenticated;

create function public.consultar_planejamento_instrutor(p_instrutor uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u public.users%rowtype; i public.instrutores%rowtype; result jsonb;
 today date := (current_timestamp at time zone 'America/Sao_Paulo')::date;
begin
 select * into u from public.users where id=auth.uid();
 if u.id is null or u.status::text<>'active' or u.role::text not in ('admin','editor','viewer') then raise exception 'Sem permissão para consultar o planejamento.'; end if;
 if p_inicio is null or p_fim is null or p_inicio<today or p_fim<p_inicio or p_fim-p_inicio>179 then raise exception 'Consulte um período futuro de até 180 dias.'; end if;
 select * into i from public.instrutores where id=p_instrutor and tenant_id=u.tenant_id and active is not false;
 if i.id is null then raise exception 'Instrutor indisponível nesta unidade.'; end if;
 select jsonb_build_object('loaded_at',now(),'history_from',today-84,'history_to',today-1,
 'routine',(select to_jsonb(r) from public.instrutor_rotinas r where r.tenant_id=u.tenant_id and r.instrutor_id=i.id),
 'aulas',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'data',a.data,'inicio',a.horario_inicio,'fim',a.horario_fim,
 'descricao',coalesce(nullif(a.numero_turma,''),a.nome_materia,a.nome_curso,'Aula'),'legacy',a.instrutor_id is null) order by a.data,a.horario_inicio,a.id)
 from public.aulas a where a.tenant_id=u.tenant_id and a.data between p_inicio and p_fim and a.status::text<>'cancelada'
 and (a.instrutor_id=i.id or (a.instrutor_id is null and a.nome_instrutor=i.nome))),'[]'::jsonb),
 'historico',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'data',a.data,'inicio',a.horario_inicio,'fim',a.horario_fim,'descricao','Histórico de agendamento') order by a.data,a.horario_inicio,a.id)
 from public.aulas a where a.tenant_id=u.tenant_id and a.data between today-84 and today-1 and a.status::text<>'cancelada'
 and (a.instrutor_id=i.id or (a.instrutor_id is null and a.nome_instrutor=i.nome))),'[]'::jsonb),
 'eventos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'data',e.date,'inicio',e.start_time,'fim',e.end_time,'descricao',e.name,'diaInteiro',e.type='ferias') order by e.date,e.id)
 from public.events e where e.tenant_id=u.tenant_id and e.instructor_id=i.id and e.date between p_inicio and p_fim and e.status is distinct from 'cancelado'),'[]'::jsonb),
 'feriados',coalesce((select jsonb_agg(jsonb_build_object('data',f.data,'descricao','Feriado: '||coalesce(f.descricao,''))) from public.feriados f where f.tenant_id=u.tenant_id and f.ativo is true and f.data between p_inicio and p_fim),'[]'::jsonb),
 'bloqueios',coalesce((select jsonb_agg(jsonb_build_object('data',b.data,'descricao','Bloqueio: '||coalesce(b.motivo,''))) from public.datas_bloqueadas b where b.tenant_id=u.tenant_id and b.ativo is true and b.data between p_inicio and p_fim),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.consultar_planejamento_instrutor(uuid,date,date) from public,anon;
grant execute on function public.consultar_planejamento_instrutor(uuid,date,date) to authenticated;
