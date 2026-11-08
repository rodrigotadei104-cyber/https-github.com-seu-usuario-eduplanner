-- Alterações de instrutor ou sala em aulas selecionadas: prévia e confirmação transacional.
-- SECURITY INVOKER mantém as políticas e permissões existentes. Não cria nem exclui aulas.
-- Permite somente a auditoria desta operação pelo próprio editor/admin da unidade.
create policy turma_resource_change_audit_insert on public.audit_logs
    for insert to authenticated with check (
        user_id = (select auth.uid()) and action = 'UPDATE' and entity = 'turma'
        and result = 'success' and details->>'type' = 'TURMA_RESOURCE_CHANGE'
        and exists (select 1 from public.users u where u.id = (select auth.uid())
            and u.tenant_id = audit_logs.tenant_id and u.status::text = 'active'
            and u.role::text in ('admin', 'editor')
            and u.email = audit_logs.user_email and u.role::text = audit_logs.user_role)
    );

create or replace function public.alterar_recursos_turma(
    p_ids uuid[], p_tipo text, p_destino text, p_expected jsonb, p_aplicar boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_user public.users%rowtype;
    v_anchor public.aulas%rowtype;
    v_snapshot jsonb;
    v_conflicts jsonb;
    v_destino text := btrim(p_destino);
    v_instrutor uuid;
    v_count integer;
    v_changed integer;
    v_now timestamp := current_timestamp at time zone 'America/Sao_Paulo';
begin
    select * into v_user from public.users where id = auth.uid();
    if v_user.id is null or v_user.status::text <> 'active' or v_user.role::text not in ('admin', 'editor') then
        raise exception 'Você não tem permissão para alterar aulas.';
    end if;
    if p_aplicar is null or p_tipo is null or p_tipo not in ('instrutor', 'sala') or v_destino is null or v_destino = '' or length(v_destino) > 160 then
        raise exception 'Escolha um instrutor ou uma sala válida.';
    end if;
    if coalesce(cardinality(p_ids), 0) not between 1 and 500
        or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
        or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_expected) <> cardinality(p_ids) then
        raise exception 'Selecione de 1 a 500 aulas distintas e gere uma prévia.';
    end if;
    -- Serializa alterações em lote da mesma unidade e bloqueia as linhas em ordem estável.
    perform pg_advisory_xact_lock(hashtextextended('eduplanner-turma:' || v_user.tenant_id::text, 0));
    perform a.id from public.aulas a where a.id = any(p_ids) and a.tenant_id = v_user.tenant_id order by a.id for update;
    select count(*), jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'sala', coalesce(a.sala, ''), 'horario_inicio', to_char(a.horario_inicio, 'HH24:MI'),
        'horario_fim', to_char(a.horario_fim, 'HH24:MI')) order by a.id)
        into v_count, v_snapshot from public.aulas a where a.id = any(p_ids) and a.tenant_id = v_user.tenant_id;
    if v_count <> cardinality(p_ids) then raise exception 'Uma aula não está mais disponível nesta unidade. Atualize a agenda.'; end if;
    select * into v_anchor from public.aulas where id = p_ids[1] and tenant_id = v_user.tenant_id;
    if exists (select 1 from public.aulas a where a.id = any(p_ids) and (
        a.status::text <> 'agendada' or a.data + a.horario_inicio <= v_now
        or (v_anchor.turma_id is not null and a.turma_id is distinct from v_anchor.turma_id)
        or (v_anchor.turma_id is null and (a.turma_id is not null or v_anchor.curso_id is null
            or nullif(btrim(v_anchor.numero_turma), '') is null or a.curso_id is distinct from v_anchor.curso_id
            or a.numero_turma is distinct from v_anchor.numero_turma)))) then
        raise exception 'A seleção deve conter apenas aulas futuras agendadas de uma única turma identificada.';
    end if;
    if (p_aplicar and v_snapshot is distinct from p_expected) or (not p_aplicar and not (v_snapshot @> p_expected)) then
        raise exception 'A agenda foi alterada. Atualize a tela e gere uma nova prévia.';
    end if;
    if p_tipo = 'instrutor' then
        begin v_instrutor := v_destino::uuid;
        exception when invalid_text_representation then raise exception 'Instrutor inválido.'; end;
        perform id from public.instrutores where id = v_instrutor and tenant_id = v_user.tenant_id and active is not false;
        if not found then raise exception 'Instrutor indisponível nesta unidade.'; end if;
    end if;
    if exists (select 1 from public.aulas a where a.id = any(p_ids) and (
        (p_tipo = 'instrutor' and a.instrutor_id = v_instrutor)
        or (p_tipo = 'sala' and btrim(coalesce(a.sala, '')) = v_destino))) then
        raise exception 'Há aulas que já possuem o destino escolhido. Gere uma nova seleção.';
    end if;
    -- Disciplinas da própria turma podem compor um mesmo bloco de aula; não são outra reserva.
    with conflitos as (
        select distinct b.id, b.data, b.horario_inicio::text as inicio, b.horario_fim::text as fim,
            coalesce(c.nome, b.numero_turma, 'Outra aula') as descricao
        from public.aulas a join public.aulas b on b.tenant_id = a.tenant_id and b.data = a.data
            and b.horario_inicio < a.horario_fim and b.horario_fim > a.horario_inicio
        left join public.cursos c on c.id = b.curso_id
        where a.id = any(p_ids) and b.status::text <> 'cancelada' and not (b.id = any(p_ids))
            and ((p_tipo = 'instrutor' and b.instrutor_id = v_instrutor)
                or (p_tipo = 'sala' and lower(btrim(b.sala)) = lower(v_destino)))
            and not coalesce((v_anchor.turma_id is not null and b.turma_id = v_anchor.turma_id)
                or (v_anchor.turma_id is null and b.turma_id is null and b.curso_id = v_anchor.curso_id and b.numero_turma = v_anchor.numero_turma), false)
        union
        select distinct e.id, e.date, e.start_time::text, e.end_time::text, e.name
        from public.aulas a join public.events e on e.tenant_id = a.tenant_id and e.date = a.data
        where a.id = any(p_ids) and e.status <> 'cancelado' and (
            (p_tipo = 'instrutor' and e.instructor_id = v_instrutor and (e.type = 'ferias'
                or (e.start_time < a.horario_fim and e.end_time > a.horario_inicio)))
            or (p_tipo = 'sala' and lower(btrim(e.room)) = lower(v_destino)
                and e.start_time < a.horario_fim and e.end_time > a.horario_inicio))
    ) select coalesce(jsonb_agg(to_jsonb(conflitos) order by data, inicio, id), '[]'::jsonb) into v_conflicts from conflitos;
    if not p_aplicar or jsonb_array_length(v_conflicts) > 0 then
        return jsonb_build_object('snapshot', v_snapshot, 'conflicts', v_conflicts, 'changedCount', v_count, 'applied', false);
    end if;
    update public.aulas set instrutor_id = case when p_tipo = 'instrutor' then v_instrutor else instrutor_id end,
        sala = case when p_tipo = 'sala' then v_destino else sala end
        where id = any(p_ids) and tenant_id = v_user.tenant_id;
    get diagnostics v_changed = row_count;
    if v_changed <> v_count then raise exception 'Não foi possível alterar todas as aulas. Nenhuma mudança foi aplicada.'; end if;
    insert into public.audit_logs (tenant_id, user_id, user_email, user_role, action, entity, entity_id, details, result)
    values (v_user.tenant_id, v_user.id, v_user.email, v_user.role::text, 'UPDATE', 'turma', v_anchor.turma_id,
        jsonb_build_object('type', 'TURMA_RESOURCE_CHANGE', 'tipo', p_tipo, 'destino', v_destino, 'before', v_snapshot,
            'aulaIds', to_jsonb(p_ids), 'affectedCount', v_changed), 'success');
    return jsonb_build_object('snapshot', v_snapshot, 'conflicts', '[]'::jsonb, 'changedCount', v_changed, 'applied', true);
end;
$$;
revoke all on function public.alterar_recursos_turma(uuid[], text, text, jsonb, boolean) from public, anon;
grant execute on function public.alterar_recursos_turma(uuid[], text, text, jsonb, boolean) to authenticated;
