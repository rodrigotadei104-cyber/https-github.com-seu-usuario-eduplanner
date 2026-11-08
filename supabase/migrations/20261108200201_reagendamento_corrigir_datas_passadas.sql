-- Correção de aulas antigas com justificativa e preservação da auditoria.
drop function public.reagendar_aulas_turma(jsonb,jsonb,boolean);
create or replace function public.reagendar_aulas_turma(p_changes jsonb,p_expected jsonb,p_aplicar boolean default false,p_motivo text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_user public.users%rowtype; v_anchor public.aulas%rowtype;
 p_ids uuid[]; v_changes jsonb; v_snapshot jsonb; v_conflicts jsonb; v_count integer; v_changed integer;
 v_now timestamp := current_timestamp at time zone 'America/Sao_Paulo';
 v_motivo text := btrim(coalesce(p_motivo,''));
begin
 select * into v_user from public.users where id=auth.uid();
 if v_user.id is null or v_user.status::text <> 'active' or v_user.role::text not in ('admin','editor') then
 raise exception 'Você não tem permissão para reagendar aulas.'; end if;
 if p_aplicar is null or jsonb_typeof(p_changes) is distinct from 'array'
 or jsonb_typeof(p_expected) is distinct from 'array' then raise exception 'Seleção inválida. Gere uma nova prévia.'; end if;
 if jsonb_array_length(p_changes) not between 1 and 500 or jsonb_array_length(p_expected) <> jsonb_array_length(p_changes) then
 raise exception 'Selecione de 1 a 500 aulas e gere uma prévia.'; end if;
 if exists(select 1 from jsonb_array_elements(p_changes) x where jsonb_typeof(x) is distinct from 'object'
 or coalesce(x->>'nova_data','') !~ '^\d{4}-\d{2}-\d{2}$' or nullif(x->>'id','') is null) then
 raise exception 'Informe uma nova data válida para cada aula.'; end if;
 begin
 select array_agg(x.id order by x.id),jsonb_agg(jsonb_build_object('id',x.id,'nova_data',x.nova_data::date) order by x.id)
 into p_ids,v_changes from jsonb_to_recordset(p_changes) as x(id uuid,nova_data text);
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
 raise exception 'Informe aulas e datas válidas.'; end;
 if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then raise exception 'Há aulas repetidas na seleção.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('eduplanner-turma:'||v_user.tenant_id::text,0));
 perform a.id from public.aulas a where a.id=any(p_ids) and a.tenant_id=v_user.tenant_id order by a.id for update;
 select count(*),jsonb_agg(to_jsonb(a)||jsonb_build_object('sala',coalesce(a.sala,''),
 'horario_inicio',to_char(a.horario_inicio,'HH24:MI'),'horario_fim',to_char(a.horario_fim,'HH24:MI'),'nova_data',x.nova_data,
 'motivo_reagendamento',v_motivo) order by a.id)
 into v_count,v_snapshot from public.aulas a join jsonb_to_recordset(v_changes) as x(id uuid,nova_data date) on x.id=a.id
 where a.tenant_id=v_user.tenant_id;
 if v_count<>cardinality(p_ids) then raise exception 'Uma aula não está mais disponível nesta unidade. Atualize a agenda.'; end if;
    select * into v_anchor from public.aulas where id = p_ids[1] and tenant_id = v_user.tenant_id;
    if exists (select 1 from public.aulas a where a.id = any(p_ids) and (
        (a.status::text <> 'agendada' and not (a.status::text='concluida' and a.data+a.horario_fim<=v_now))
        or (v_anchor.turma_id is not null and a.turma_id is distinct from v_anchor.turma_id)
        or (v_anchor.turma_id is null and (a.turma_id is not null
            or nullif(btrim(v_anchor.numero_turma), '') is null or a.curso_id is distinct from v_anchor.curso_id
            or a.numero_turma is distinct from v_anchor.numero_turma
            or (v_anchor.curso_id is null and (nullif(btrim(v_anchor.nome_curso), '') is null
                or a.nome_curso is distinct from v_anchor.nome_curso)))))) then
        raise exception 'Selecione aulas agendadas ou concluídas no passado de uma única turma. Aulas canceladas e em andamento não podem ser reagendadas.';
    end if;

 if length(v_motivo)>1000 or (length(v_motivo)<10 and exists(select 1 from public.aulas a where a.id=any(p_ids)
 and (a.data+a.horario_inicio<=v_now or a.status::text='concluida'))) then
 raise exception 'Informe uma justificativa de 10 a 1000 caracteres para corrigir aulas de datas passadas.'; end if;

 if exists(select 1 from public.aulas a join jsonb_to_recordset(v_changes) as x(id uuid,nova_data date) on x.id=a.id
 where x.nova_data=a.data or x.nova_data+a.horario_inicio<=v_now) then raise exception 'Escolha novas datas futuras para todas as aulas selecionadas.'; end if;
 if exists(select 1 from public.aulas a join jsonb_to_recordset(v_changes) as x(id uuid,nova_data date) on x.id=a.id
 group by a.data having count(distinct x.nova_data)>1) then raise exception 'Disciplinas do mesmo dia devem manter a mesma nova data.'; end if;
 if (p_aplicar and v_snapshot is distinct from p_expected) or (not p_aplicar and not(v_snapshot @> p_expected)) then
 raise exception 'A agenda ou as datas foram alteradas. Atualize a tela e gere uma nova prévia.'; end if;
 with moving as (
 select a.*,x.nova_data from public.aulas a join jsonb_to_recordset(v_changes) as x(id uuid,nova_data date) on x.id=a.id
 where a.tenant_id=v_user.tenant_id
 ), conflicts as (
 select distinct b.id,m.nova_data as data,b.horario_inicio::text as inicio,b.horario_fim::text as fim,
 'Aula: '||coalesce(b.numero_turma,b.nome_curso,'outra reserva') as descricao
 from moving m join public.aulas b on b.tenant_id=m.tenant_id and b.data=m.nova_data
 and b.horario_inicio<m.horario_fim and b.horario_fim>m.horario_inicio
 where not(b.id=any(p_ids)) and b.status::text<>'cancelada' and (
 b.instrutor_id=m.instrutor_id or (nullif(btrim(m.sala),'') is not null and lower(btrim(b.sala))=lower(btrim(m.sala)))
 or (m.turma_id is not null and b.turma_id=m.turma_id)
 or (m.turma_id is null and b.turma_id is null and b.numero_turma=m.numero_turma
 and ((m.curso_id is not null and b.curso_id=m.curso_id) or (m.curso_id is null and b.curso_id is null and b.nome_curso=m.nome_curso))))
 union
 select b.id,m.nova_data,b.horario_inicio::text,b.horario_fim::text,'Sobreposição entre aulas selecionadas'
 from moving m join moving b on m.id<b.id and m.data<>b.data and m.nova_data=b.nova_data
 and b.horario_inicio<m.horario_fim and b.horario_fim>m.horario_inicio
 union
 select distinct e.id,m.nova_data,e.start_time::text,e.end_time::text,'Evento: '||coalesce(e.name,'reserva')
 from moving m join public.events e on e.tenant_id=m.tenant_id and e.date=m.nova_data
 where e.status is distinct from 'cancelado' and (
 (e.instructor_id=m.instrutor_id and (e.type='ferias' or (e.start_time<m.horario_fim and e.end_time>m.horario_inicio)))
 or (nullif(btrim(m.sala),'') is not null and lower(btrim(e.room))=lower(btrim(m.sala))
 and e.start_time<m.horario_fim and e.end_time>m.horario_inicio))
 union
 select distinct f.id,m.nova_data,'00:00','23:59','Feriado: '||coalesce(f.descricao,'dia bloqueado')
 from moving m join public.feriados f on f.tenant_id=m.tenant_id and f.data=m.nova_data and f.ativo is true
 union
 select distinct d.id,m.nova_data,'00:00','23:59','Recesso ou bloqueio: '||coalesce(d.motivo,'dia bloqueado')
 from moving m join public.datas_bloqueadas d on d.tenant_id=m.tenant_id and d.data=m.nova_data and d.ativo is true
 ) select coalesce(jsonb_agg(to_jsonb(conflicts) order by data,inicio,id),'[]'::jsonb) into v_conflicts from conflicts;
 if not p_aplicar or jsonb_array_length(v_conflicts)>0 then
 return jsonb_build_object('snapshot',v_snapshot,'conflicts',v_conflicts,'changedCount',v_count,'applied',false); end if;
 update public.aulas a set data=x.nova_data,status=case when a.status::text='concluida' then 'agendada' else a.status end
 from jsonb_to_recordset(v_changes) as x(id uuid,nova_data date)
 where a.id=x.id and a.tenant_id=v_user.tenant_id;
 get diagnostics v_changed=row_count;
 if v_changed<>v_count then raise exception 'Não foi possível reagendar todas as aulas. Nenhuma mudança foi aplicada.'; end if;
 insert into public.audit_logs(tenant_id,user_id,user_email,user_role,action,entity,entity_id,details,result)
 values(v_user.tenant_id,v_user.id,v_user.email,v_user.role::text,'UPDATE','turma',v_anchor.turma_id,
 jsonb_build_object('type','TURMA_RESCHEDULE','before',v_snapshot,'changes',v_changes,'affectedCount',v_changed,'motivo',v_motivo),'success');
 return jsonb_build_object('snapshot',v_snapshot,'conflicts','[]'::jsonb,'changedCount',v_changed,'applied',true);
end $$;
revoke all on function public.reagendar_aulas_turma(jsonb,jsonb,boolean,text) from public,anon;
grant execute on function public.reagendar_aulas_turma(jsonb,jsonb,boolean,text) to authenticated;
