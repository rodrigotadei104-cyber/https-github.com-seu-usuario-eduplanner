\set ON_ERROR_STOP on
-- Apenas banco descartável local. Tudo, inclusive os dados de teste, é revertido ao final.
do $$ begin if current_database() <> 'eduplanner_turma_changes_test' then
    raise exception 'Execute apenas no banco local eduplanner_turma_changes_test'; end if; end $$;
begin;
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
create table public.users (id uuid primary key, tenant_id uuid not null, email text, role text, status text);
create table public.instrutores (id uuid primary key, tenant_id uuid not null, nome text, active boolean default true);
create table public.cursos (id uuid primary key, tenant_id uuid not null, nome text);
create table public.aulas (id uuid primary key, tenant_id uuid not null, turma_id uuid, numero_turma text,
    curso_id uuid, materia_id uuid, disciplina_id uuid, instrutor_id uuid, sala text, data date,
    horario_inicio time, horario_fim time, status text, carga_horaria_materia numeric, nome_curso text);
create table public.events (id uuid primary key, tenant_id uuid, instructor_id uuid, room text,
    name text, date date, start_time time, end_time time, type text, status text);
create table public.audit_logs (id uuid default gen_random_uuid(), tenant_id uuid, user_id uuid,
    user_email text, user_role text, action text, entity text, entity_id uuid, details jsonb, result text);
create table public.feriados(id uuid,tenant_id uuid,data date,descricao text,ativo boolean);
create table public.datas_bloqueadas(id uuid,tenant_id uuid,data date,motivo text,ativo boolean);
grant select,insert,update,delete on public.feriados,public.datas_bloqueadas to authenticated;
alter table public.feriados enable row level security;
create policy tenant on public.feriados to authenticated using (tenant_id=(select tenant_id from public.users where id=auth.uid()));
alter table public.datas_bloqueadas enable row level security;
create policy tenant on public.datas_bloqueadas to authenticated using (tenant_id=(select tenant_id from public.users where id=auth.uid()));
grant usage on schema public, auth to authenticated, anon;
grant select on public.users, public.instrutores, public.cursos to authenticated;
grant select, insert, update, delete on public.aulas, public.events to authenticated;
grant select, insert on public.audit_logs to authenticated;
alter table public.users enable row level security;
create policy self on public.users for select to authenticated using (id = auth.uid());
alter table public.aulas enable row level security;
create policy tenant on public.aulas to authenticated using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
alter table public.events enable row level security;
create policy tenant on public.events to authenticated using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
alter table public.audit_logs enable row level security;
create policy tenant_read on public.audit_logs for select to authenticated using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
insert into public.users values
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin@test.invalid','admin','active'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','viewer@test.invalid','viewer','active'),
('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','inactive@test.invalid','admin','inactive');
insert into public.instrutores values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Antigo',true),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Novo',true),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Outra unidade',true);
insert into public.cursos values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Guindaste');
insert into public.aulas (id,tenant_id,turma_id,numero_turma,curso_id,materia_id,instrutor_id,sala,data,horario_inicio,horario_fim,status,carga_horaria_materia) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','703601','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Sala 4','2099-11-14','08:00','10:00','agendada',2),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','703601','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Sala 4','2099-11-14','10:00','12:00','agendada',2),
('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','999999','30000000-0000-0000-0000-000000000001',null,'20000000-0000-0000-0000-000000000001','Sala 9','2099-11-21','08:00','10:00','agendada',2),
('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','703601','30000000-0000-0000-0000-000000000001',null,'20000000-0000-0000-0000-000000000003','Sala 4','2099-11-14','08:00','10:00','agendada',2);
\ir ../supabase/migrations/20261108145103_alterar_recursos_turma.sql
\ir ../supabase/migrations/20261108151456_alterar_recursos_turma_legado.sql
\ir ../supabase/migrations/20261108152450_reagendar_aulas_turma.sql
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as
    $$ begin if ok is distinct from true then raise exception 'TESTE: %', message; end if; end $$;
create function pg_temp.expect_failure(command text, message_part text) returns void language plpgsql as $$
begin
    begin execute command;
    exception when others then
        if position(message_part in sqlerrm) = 0 then raise; end if;
        return;
    end;
    raise exception 'TESTE: deveria falhar: %', command;
end $$;
grant execute on function pg_temp.assert_ok(boolean,text), pg_temp.expect_failure(text,text) to authenticated;
select set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ declare
    ids uuid[] := array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']::uuid[];
    expected jsonb := '[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000002"}]';
    preview jsonb;
    result jsonb;
begin
    preview := public.alterar_recursos_turma(ids,'instrutor','20000000-0000-0000-0000-000000000002',expected,false);
    perform pg_temp.assert_ok((preview->>'changedCount')::int=2 and preview->'conflicts'='[]' and not (preview->>'applied')::boolean,'prévia sem conflito');
    perform pg_temp.assert_ok((select count(*)=2 from public.aulas where id=any(ids) and instrutor_id='20000000-0000-0000-0000-000000000001'),'prévia não grava');
    result := public.alterar_recursos_turma(ids,'instrutor','20000000-0000-0000-0000-000000000002',preview->'snapshot',true);
    perform pg_temp.assert_ok((result->>'applied')::boolean,'lote aplicado');
    perform pg_temp.assert_ok((select count(*)=2 from public.aulas where id=any(ids) and instrutor_id='20000000-0000-0000-0000-000000000002' and sala='Sala 4' and carga_horaria_materia=2),'preserva sala e carga');
    perform pg_temp.assert_ok((select count(*)=1 from public.audit_logs where details->>'type'='TURMA_RESOURCE_CHANGE'),'auditoria em conjunto');
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,true)',ids,'instrutor','20000000-0000-0000-0000-000000000002',preview->'snapshot'),'A agenda foi alterada');
    update public.aulas set instrutor_id='20000000-0000-0000-0000-000000000001' where id=any(ids);
    -- Ocupação por uma aula legada sem turma_id: não pode ser ignorada por NULL.
    insert into public.aulas select '40000000-0000-0000-0000-000000000009',tenant_id,null,'outra',curso_id,null,null,'20000000-0000-0000-0000-000000000002','Sala 9',data,'08:30','09:30','agendada',2,null from public.aulas where id=ids[1];
    preview := public.alterar_recursos_turma(ids,'instrutor','20000000-0000-0000-0000-000000000002',expected,false);
    perform pg_temp.assert_ok(jsonb_array_length(preview->'conflicts')=1,'detecta conflito com aula legada');
    result := public.alterar_recursos_turma(ids,'instrutor','20000000-0000-0000-0000-000000000002',preview->'snapshot',true);
    perform pg_temp.assert_ok(not (result->>'applied')::boolean,'conflito bloqueia confirmação');
    perform pg_temp.assert_ok((select count(*)=2 from public.aulas where id=any(ids) and instrutor_id='20000000-0000-0000-0000-000000000001'),'não deixa metade do lote');
    delete from public.aulas where id='40000000-0000-0000-0000-000000000009';
    insert into public.events values ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',null,'Férias','2099-11-14','00:00','00:00','ferias','agendado');
    preview := public.alterar_recursos_turma(ids,'instrutor','20000000-0000-0000-0000-000000000002',expected,false);
    perform pg_temp.assert_ok(jsonb_array_length(preview->'conflicts')=1,'férias bloqueiam o dia todo');
    delete from public.events;
    -- Revalida uma ocupação criada depois da prévia.
    preview := public.alterar_recursos_turma(ids,'sala','Sala 5',expected,false);
    insert into public.events values ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',null,'Sala 5','Evento','2099-11-14','09:00','11:00','outro','agendado');
    result := public.alterar_recursos_turma(ids,'sala','Sala 5',preview->'snapshot',true);
    perform pg_temp.assert_ok(not (result->>'applied')::boolean,'novo evento bloqueia prévia antiga');
    delete from public.events;
    result := public.alterar_recursos_turma(ids,'sala','Sala 5',preview->'snapshot',true);
    perform pg_temp.assert_ok((result->>'applied')::boolean and (select count(*)=2 from public.aulas where id=any(ids) and sala='Sala 5' and instrutor_id='20000000-0000-0000-0000-000000000001'),'troca só sala');
    update public.aulas set sala='Sala 4' where id=any(ids);
    preview := public.alterar_recursos_turma(ids,'sala','Sala 5',expected,false);
    update public.aulas set sala='Sala 8' where id=ids[2];
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,true)',ids,'sala','Sala 5',preview->'snapshot'),'A agenda foi alterada');
    perform pg_temp.assert_ok((select sala='Sala 4' from public.aulas where id=ids[1]),'prévia obsoleta não altera a primeira aula');
    update public.aulas set sala='Sala 4' where id=any(ids);
    update public.aulas set status='concluida' where id=ids[2];
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,false)',ids,'sala','Sala 5',expected),'apenas aulas futuras');
    update public.aulas set status='agendada' where id=ids[2];
    update public.aulas set data='2020-01-01' where id=ids[2];
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,false)',ids,'sala','Sala 5',expected),'apenas aulas futuras');
    update public.aulas set data='2099-11-14' where id=ids[2];
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,false)',ids,'instrutor','20000000-0000-0000-0000-000000000003',expected),'Instrutor indisponível');
    perform pg_temp.expect_failure($q$select public.alterar_recursos_turma(array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004']::uuid[],'sala','Sala 5','[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000004"}]',false)$q$,'não está mais disponível');
    perform pg_temp.expect_failure($q$select public.alterar_recursos_turma(array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003']::uuid[],'sala','Sala 5','[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000003"}]',false)$q$,'única turma');
end $$;
-- Mesmo formato das turmas 706794/706254: sem curso_id/turma_id, com nome_curso.
do $$ declare
 ids uuid[] := array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']::uuid[];
 expected jsonb := '[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000002"}]';
 p jsonb; r jsonb;
begin
 update public.aulas set turma_id=null,curso_id=null,numero_turma='706794',nome_curso='Curso legado' where id=any(ids);
 p := public.alterar_recursos_turma(ids,'sala','Sala 5',expected,false);
 perform pg_temp.assert_ok((p->>'changedCount')::int=2,'prévia de turma legada sem IDs');
 r := public.alterar_recursos_turma(ids,'sala','Sala 5',p->'snapshot',true);
 perform pg_temp.assert_ok((r->>'applied')::boolean,'aplica troca em turma legada');
 update public.aulas set sala='Sala 4',nome_curso='Outro curso' where id=ids[2];
 perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,false)',ids,'sala','Sala 6',expected),'única turma');
 update public.aulas set sala='Sala 4',nome_curso='Curso legado' where id=any(ids);
 insert into public.aulas select '40000000-0000-0000-0000-000000000009',tenant_id,null,numero_turma,null,null,null,instrutor_id,'Sala 6',data,'08:30','09:30','agendada',2,'Outro curso' from public.aulas where id=ids[1];
 p := public.alterar_recursos_turma(ids,'sala','Sala 6',expected,false);
 perform pg_temp.assert_ok(jsonb_array_length(p->'conflicts')=1,'mesmo número com outro curso continua sendo conflito');
 update public.aulas set nome_curso='Curso legado' where id='40000000-0000-0000-0000-000000000009';
 p := public.alterar_recursos_turma(ids,'sala','Sala 6',expected,false);
 perform pg_temp.assert_ok(jsonb_array_length(p->'conflicts')=0,'fragmento da mesma turma legada não conflita consigo');
 delete from public.aulas where id='40000000-0000-0000-0000-000000000009';
 update public.aulas set nome_curso=' ' where id=any(ids);
 perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,false)',ids,'sala','Sala 6',expected),'única turma');
 update public.aulas set turma_id='50000000-0000-0000-0000-000000000001',curso_id='30000000-0000-0000-0000-000000000001',numero_turma='703601',nome_curso=null where id=any(ids);
end $$;
select set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);
select pg_temp.expect_failure($q$select public.alterar_recursos_turma(array['40000000-0000-0000-0000-000000000001']::uuid[],'sala','Sala 5','[{"id":"40000000-0000-0000-0000-000000000001"}]',false)$q$,'não tem permissão');
select set_config('test.user_id','00000000-0000-0000-0000-000000000003',false);
select pg_temp.expect_failure($q$select public.alterar_recursos_turma(array['40000000-0000-0000-0000-000000000001']::uuid[],'sala','Sala 5','[{"id":"40000000-0000-0000-0000-000000000001"}]',false)$q$,'não tem permissão');
select set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);
reset role;
-- Simula uma falha durante a atualização da segunda linha. O lote e o log devem ser revertidos.
set role authenticated;
\ir test_turma_reschedule.sql
reset role;
create function pg_temp.fail_second_row() returns trigger language plpgsql as $$ begin
    if new.id='40000000-0000-0000-0000-000000000002' then raise exception 'Falha de armazenamento simulada'; end if;
    return new;
end $$;
create trigger test_storage_failure before update on public.aulas for each row execute function pg_temp.fail_second_row();
set role authenticated;
do $$ declare ids uuid[] := array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']::uuid[];
    p jsonb; log_count integer;
begin
    select count(*) into log_count from public.audit_logs;
    p := public.alterar_recursos_turma(ids,'sala','Sala 5','[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000002"}]',false);
    perform pg_temp.expect_failure(format('select public.alterar_recursos_turma(%L::uuid[],%L,%L,%L::jsonb,true)',ids,'sala','Sala 5',p->'snapshot'),'Falha de armazenamento simulada');
    perform pg_temp.assert_ok((select count(*)=2 from public.aulas where id=any(ids) and sala='Sala 4'),'rollback integral das aulas');
    perform pg_temp.assert_ok((select count(*)=log_count from public.audit_logs),'não cria log de sucesso após falha');
    p := public.reagendar_aulas_turma('[{"id":"40000000-0000-0000-0000-000000000001","nova_data":"2099-11-28"},{"id":"40000000-0000-0000-0000-000000000002","nova_data":"2099-11-28"}]','[{"id":"40000000-0000-0000-0000-000000000001"},{"id":"40000000-0000-0000-0000-000000000002"}]',false);
    perform pg_temp.expect_failure(format('select public.reagendar_aulas_turma(%L::jsonb,%L::jsonb,true)','[{"id":"40000000-0000-0000-0000-000000000001","nova_data":"2099-11-28"},{"id":"40000000-0000-0000-0000-000000000002","nova_data":"2099-11-28"}]',p->'snapshot'),'Falha de armazenamento simulada');
    perform pg_temp.assert_ok((select count(*)=2 from public.aulas where id=any(ids) and data='2099-11-14'),'rollback integral do reagendamento');
    perform pg_temp.assert_ok((select count(*)=log_count from public.audit_logs),'rollback do histórico do reagendamento');
end $$;
reset role;
select pg_temp.assert_ok(not has_function_privilege('anon','public.alterar_recursos_turma(uuid[],text,text,jsonb,boolean)','EXECUTE'),'anon não executa a função');
select pg_temp.assert_ok(not has_function_privilege('anon','public.reagendar_aulas_turma(jsonb,jsonb,boolean)','EXECUTE'),'anon não reagenda');
rollback;
\echo 'OK: SQL real validou prévia, troca, RLS, permissões, conflitos, férias, dados obsoletos e rollback integral.'
