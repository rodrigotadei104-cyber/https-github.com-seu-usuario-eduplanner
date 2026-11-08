-- Refeições e descansos não são disponibilidade, inclusive fora da jornada.
create function public.validar_pausas_instrutor(p_pausas jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if not public.validar_rotina_instrutor(p_pausas) then return false; end if;
 return not exists(select 1 from jsonb_array_elements(p_pausas) w where w?'descricao'
 and (jsonb_typeof(w->'descricao') is distinct from 'string' or length(w->>'descricao')>120));
end $$;
revoke all on function public.validar_pausas_instrutor(jsonb) from public,anon;
grant execute on function public.validar_pausas_instrutor(jsonb) to authenticated;
alter table public.instrutor_rotinas add column pausas jsonb not null default '[]'::jsonb
 check(public.validar_pausas_instrutor(pausas));
drop function public.salvar_rotina_instrutor(uuid,jsonb,timestamptz);
create function public.salvar_rotina_instrutor(p_instrutor uuid,p_janelas jsonb,p_version timestamptz default null,p_pausas jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.users%rowtype; previous public.instrutor_rotinas%rowtype; saved public.instrutor_rotinas%rowtype; v_pausas jsonb;
begin
 select * into u from public.users where id=auth.uid();
 if u.id is null or u.status::text<>'active' or u.role::text not in ('admin','editor') then raise exception 'Sem permissão para salvar a rotina.'; end if;
 if not public.validar_rotina_instrutor(p_janelas) then raise exception 'Rotina inválida: revise horários e sobreposições.'; end if;
 if not exists(select 1 from public.instrutores i where i.id=p_instrutor and i.tenant_id=u.tenant_id and i.active is not false) then raise exception 'Instrutor indisponível nesta unidade.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('eduplanner-rotina:'||u.tenant_id::text||':'||p_instrutor::text,0));
 select * into previous from public.instrutor_rotinas where tenant_id=u.tenant_id and instrutor_id=p_instrutor for update;
 if previous.updated_at is distinct from p_version then raise exception 'A rotina foi alterada por outro usuário. Recarregue antes de salvar.'; end if;
 v_pausas:=coalesce(p_pausas,previous.pausas,'[]'::jsonb);
 if not public.validar_pausas_instrutor(v_pausas) then raise exception 'Revise os intervalos protegidos.'; end if;
 insert into public.instrutor_rotinas(tenant_id,instrutor_id,janelas,pausas,updated_by) values(u.tenant_id,p_instrutor,p_janelas,v_pausas,u.id)
 on conflict(tenant_id,instrutor_id) do update set janelas=excluded.janelas,pausas=excluded.pausas,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into saved;
 insert into public.audit_logs(tenant_id,user_id,user_email,user_role,action,entity,entity_id,details,result)
 values(u.tenant_id,u.id,u.email,u.role::text,'UPDATE','instrutor_rotina',p_instrutor,
 jsonb_build_object('type','INSTRUCTOR_ROUTINE','before',to_jsonb(previous),'after',to_jsonb(saved)),'success');
 return to_jsonb(saved);
end $$;
revoke all on function public.salvar_rotina_instrutor(uuid,jsonb,timestamptz,jsonb) from public,anon;
grant execute on function public.salvar_rotina_instrutor(uuid,jsonb,timestamptz,jsonb) to authenticated;

create or replace function public.consultar_planejamento_instrutor(p_instrutor uuid,p_inicio date,p_fim date)
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
 'eventos',coalesce((select jsonb_agg(ev.item order by ev.data,ev.id) from (
 select e.date as data,e.id::text as id,jsonb_build_object('id',e.id,'data',e.date,'inicio',e.start_time,'fim',e.end_time,'descricao',e.name,'diaInteiro',e.type='ferias') as item
 from public.events e where e.tenant_id=u.tenant_id and e.instructor_id=i.id and e.date between p_inicio and p_fim and e.status is distinct from 'cancelado'
 union all
 select d::date,'pausa-'||d::date::text||'-'||w.n::text,jsonb_build_object('id','pausa-'||d::date::text||'-'||w.n::text,
 'data',d::date,'inicio',w.x->>'inicio','fim',w.x->>'fim','descricao','Intervalo protegido: '||coalesce(nullif(w.x->>'descricao',''),'Refeição / descanso'),'diaInteiro',false,'protegido',true)
 from public.instrutor_rotinas r cross join jsonb_array_elements(r.pausas) with ordinality w(x,n)
 cross join generate_series(p_inicio::timestamp,p_fim::timestamp,interval '1 day') d
 where r.tenant_id=u.tenant_id and r.instrutor_id=i.id and extract(dow from d)::integer=(w.x->>'dia')::integer
 union all
 select d::date,'entre-turnos-'||d::date::text||'-'||g.n::text,jsonb_build_object('id','entre-turnos-'||d::date::text||'-'||g.n::text,
 'data',d::date,'inicio',g.inicio,'fim',g.fim,'descricao','Intervalo entre turnos','diaInteiro',false,'protegido',true)
 from public.instrutor_rotinas r cross join lateral(
 select (w.x->>'dia')::integer as dia,w.x->>'fim' as inicio,
 lead(w.x->>'inicio') over(partition by w.x->>'dia' order by w.x->>'inicio') as fim,
 row_number() over(order by w.x->>'dia',w.x->>'inicio') as n from jsonb_array_elements(r.janelas) w(x)
 ) g cross join generate_series(p_inicio::timestamp,p_fim::timestamp,interval '1 day') d
 where r.tenant_id=u.tenant_id and r.instrutor_id=i.id and g.inicio<g.fim and extract(dow from d)::integer=g.dia
 ) ev),'[]'::jsonb),
 'feriados',coalesce((select jsonb_agg(jsonb_build_object('data',f.data,'descricao','Feriado: '||coalesce(f.descricao,''))) from public.feriados f where f.tenant_id=u.tenant_id and f.ativo is true and f.data between p_inicio and p_fim),'[]'::jsonb),
 'bloqueios',coalesce((select jsonb_agg(jsonb_build_object('data',b.data,'descricao','Bloqueio: '||coalesce(b.motivo,''))) from public.datas_bloqueadas b where b.tenant_id=u.tenant_id and b.ativo is true and b.data between p_inicio and p_fim),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.consultar_planejamento_instrutor(uuid,date,date) from public,anon;
grant execute on function public.consultar_planejamento_instrutor(uuid,date,date) to authenticated;
