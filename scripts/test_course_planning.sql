-- Included inside the disposable local transaction in test_turma_changes.sql.
-- All assertions below execute as authenticated with real RLS, never --single.
create table public.catalogo_cursos(id uuid primary key,tenant_id uuid,nome_curso text,carga_total_horas numeric,tipo_hora_min text,ativo boolean);
create table public.disciplinas_curso(id uuid primary key,tenant_id uuid,curso_id uuid,nome_disciplina text,carga_horas numeric,tipo_disciplina text,ordem integer);
create table public.turmas(id uuid primary key,tenant_id uuid,numero_turma text,curso_id uuid,instrutor_id uuid,sala_padrao text,data_inicio date,dias_semana_selecionados integer[],horarios_do_dia jsonb,status text);
alter table public.aulas add column auto_gerada boolean default false;
alter table public.aulas add constraint test_curriculum_fk foreign key(disciplina_id) references public.disciplinas_curso(id) not valid;
grant select,insert,update,delete on public.catalogo_cursos,public.disciplinas_curso,public.turmas to authenticated;
alter table public.catalogo_cursos enable row level security;
alter table public.disciplinas_curso enable row level security;
alter table public.turmas enable row level security;
create policy tenant on public.catalogo_cursos to authenticated using(tenant_id=(select tenant_id from public.users where id=auth.uid()));
create policy tenant on public.disciplinas_curso to authenticated using(tenant_id=(select tenant_id from public.users where id=auth.uid()));
create policy tenant on public.turmas to authenticated using(tenant_id=(select tenant_id from public.users where id=auth.uid()));
\ir ../supabase/migrations/20261122210859_cronograma_disponibilidade_curso.sql
insert into public.catalogo_cursos values('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Curso teste',4,'50',true),
('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Curso outra unidade',4,'50',true);
insert into public.disciplinas_curso values('81000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Teoria',2,'teorica',1),
('81000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Prática',2,'pratica',2);
-- Use a future dynamic day, regardless of the machine's date.
create function pg_temp.course_request() returns jsonb language sql as $$ select jsonb_build_object(
'id','82000000-0000-0000-0000-000000000001','curso','80000000-0000-0000-0000-000000000001','instrutor','20000000-0000-0000-0000-000000000002','numero','NOVA-40','sala','Sala Teste',
'inicioBusca',((current_timestamp at time zone 'America/Sao_Paulo')::date+60),'fimBusca',((current_timestamp at time zone 'America/Sao_Paulo')::date+61),
'aulas',jsonb_build_array(jsonb_build_object('data',((current_timestamp at time zone 'America/Sao_Paulo')::date+60),'inicio','08:00','fim','09:40','disciplinaId','81000000-0000-0000-0000-000000000001'),
jsonb_build_object('data',((current_timestamp at time zone 'America/Sao_Paulo')::date+60),'inicio','09:40','fim','11:20','disciplinaId','81000000-0000-0000-0000-000000000002'))) $$;
grant execute on function pg_temp.course_request() to authenticated;
set role authenticated;
select set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);
select pg_temp.assert_ok(row_security_active('public.turmas') and row_security_active('public.catalogo_cursos'),'RLS real ativa na criação');
do $$ declare req jsonb:=pg_temp.course_request(); p jsonb; r jsonb; d date; before_count bigint; base jsonb;
begin
 d:=(req->>'inicioBusca')::date;
 base:=public.consultar_base_cronograma((req->>'curso')::uuid,(req->>'instrutor')::uuid,d,d+1,'');
 perform pg_temp.assert_ok(jsonb_array_length(base->'disciplinas')=2,'consulta completa de disciplinas');
 perform pg_temp.expect_failure(format('select public.consultar_base_cronograma(%L,%L,%L,%L,%L)','80000000-0000-0000-0000-000000000002',req->>'instrutor',d,d+1,''),'Curso indisponível');
 select count(*) into before_count from public.aulas;
 p:=public.criar_turma_planejada(req,false);
 perform pg_temp.assert_ok(not (p->>'applied')::boolean and (p->>'count')::int=2,'conferência de duas disciplinas');
 perform pg_temp.assert_ok((select count(*)=before_count from public.aulas) and not exists(select 1 from public.turmas),'conferência não grava');
 -- Concurrent single-class occupancy arriving after preview blocks the whole transaction.
 insert into public.aulas(id,tenant_id,instrutor_id,sala,data,horario_inicio,horario_fim,status,nome_instrutor) values('83000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',null,'Outra',d,'08:30','09:00','agendada',' nOvO ');
 base:=public.consultar_base_cronograma((req->>'curso')::uuid,(req->>'instrutor')::uuid,d,d+1,'');
 perform pg_temp.assert_ok(jsonb_array_length(base->'planejamento'->'aulas')=1,'consulta reconhece nome legado com espaços/maiúsculas');
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'conflito');
 perform pg_temp.assert_ok(not exists(select 1 from public.turmas),'conflito não deixa turma vazia');
 update public.aulas set nome_instrutor='Outro',sala=' sala teste ' where id='83000000-0000-0000-0000-000000000001';
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'conflito');
 delete from public.aulas where id='83000000-0000-0000-0000-000000000001';
 insert into public.events values('83000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',(req->>'instrutor')::uuid,null,'Férias',d,'00:00','00:00','ferias','agendado');
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'férias');
 delete from public.events where id='83000000-0000-0000-0000-000000000002';
 insert into public.feriados values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001',d,'Feriado teste',true);
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'feriado');
 delete from public.feriados where data=d;
 update public.disciplinas_curso set nome_disciplina='Novo nome' where id='81000000-0000-0000-0000-000000000001';
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'mudaram');
 update public.disciplinas_curso set nome_disciplina='Teoria' where id='81000000-0000-0000-0000-000000000001';
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',jsonb_set(req,'{aulas,0,fim}','"09:39"')),'carga distribuída');
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',jsonb_set(req,'{aulas,0,disciplinaId}','"81000000-0000-0000-0000-000000000099"')),'outra disciplina');
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',jsonb_set(req,'{aulas,0,data}','"2020-01-01"')),'passada');
 r:=public.criar_turma_planejada(req,true,p->'snapshot');
 perform pg_temp.assert_ok((r->>'applied')::boolean and (select count(*)=2 from public.aulas where turma_id=(req->>'id')::uuid),'turma e todas as aulas criadas');
 perform pg_temp.assert_ok((select sum(carga_horaria_materia)=4 from public.aulas where turma_id=(req->>'id')::uuid),'hora aula de 50 minutos preservada');
 perform pg_temp.assert_ok((select count(*)=1 from public.audit_logs where details->>'type'='COURSE_SCHEDULE_CREATE'),'auditoria única');
 r:=public.criar_turma_planejada(req,true,p->'snapshot');
 perform pg_temp.assert_ok((r->>'applied')::boolean and (select count(*)=2 from public.aulas where turma_id=(req->>'id')::uuid),'repetição após perda de resposta não duplica');
 perform pg_temp.assert_ok((select count(*)=1 from public.audit_logs where details->>'type'='COURSE_SCHEDULE_CREATE'),'repetição não duplica auditoria');
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',jsonb_set(req,'{id}','"82000000-0000-0000-0000-000000000002"')),'número de turma já existe');
end $$;
-- Protected intervals and 60-minute curricula use the same server validation.
do $$ declare req jsonb:=pg_temp.course_request(); p jsonb; routine jsonb; d date; teacher uuid;
begin
 d:=(req->>'inicioBusca')::date+1; teacher:=(req->>'instrutor')::uuid;
 req:=jsonb_set(jsonb_set(req,'{id}','"82000000-0000-0000-0000-000000000003"'),'{numero}','"PAUSAS-60"');
 req:=jsonb_set(jsonb_set(req,'{aulas,0,data}',to_jsonb(d::text)),'{aulas,1,data}',to_jsonb(d::text));
 routine:=public.salvar_rotina_instrutor(teacher,'[]',null,jsonb_build_array(jsonb_build_object('dia',extract(dow from d)::integer,'inicio','09:00','fim','09:30','descricao','Refeição')));
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',req),'intervalo protegido');
 perform public.salvar_rotina_instrutor(teacher,'[]',(routine->>'updated_at')::timestamptz,'[]');
 update public.catalogo_cursos set tipo_hora_min='60' where id=(req->>'curso')::uuid;
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,false)',req),'carga distribuída');
 req:=jsonb_set(jsonb_set(jsonb_set(req,'{aulas,0,fim}','"10:00"'),'{aulas,1,inicio}','"10:00"'),'{aulas,1,fim}','"12:00"');
 p:=public.criar_turma_planejada(req,false);
 perform public.criar_turma_planejada(req,true,p->'snapshot');
 perform pg_temp.assert_ok((select sum(carga_horaria_materia)=4 from public.aulas where turma_id=(req->>'id')::uuid),'curso 60 minutos: carga exata');
 update public.catalogo_cursos set tipo_hora_min='50' where id=(req->>'curso')::uuid;
end $$;
reset role;
-- A failure on the second inserted lesson must also roll back the new turma and audit.
create function pg_temp.course_fail_storage() returns trigger language plpgsql as $$ begin
 if new.numero_turma='FALHA' and new.disciplina_id='81000000-0000-0000-0000-000000000002' then raise exception 'Falha de criação simulada'; end if; return new; end $$;
create trigger course_storage_failure before insert on public.aulas for each row execute function pg_temp.course_fail_storage();
set role authenticated;
do $$ declare req jsonb:=pg_temp.course_request(); p jsonb;
begin
 req:=jsonb_set(jsonb_set(jsonb_set(req,'{id}','"82000000-0000-0000-0000-000000000002"'),'{numero}','"FALHA"'),'{instrutor}','"20000000-0000-0000-0000-000000000001"');
 req:=jsonb_set(req,'{sala}','"Sala Sem Conflito"');
 req:=jsonb_set(req,'{aulas,0,data}',to_jsonb(((req->>'inicioBusca')::date+1)::text));
 req:=jsonb_set(req,'{aulas,1,data}',to_jsonb(((req->>'inicioBusca')::date+1)::text));
 p:=public.criar_turma_planejada(req,false);
 perform pg_temp.expect_failure(format('select public.criar_turma_planejada(%L,true,%L)',req,p->'snapshot'),'Falha de criação simulada');
 perform pg_temp.assert_ok(not exists(select 1 from public.turmas where numero_turma='FALHA') and not exists(select 1 from public.aulas where numero_turma='FALHA'),'rollback de turma e todas as aulas');
end $$;
select set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);
select pg_temp.expect_failure('select public.criar_turma_planejada(pg_temp.course_request(),false)','não tem permissão');
select set_config('test.user_id','00000000-0000-0000-0000-000000000003',false);
select pg_temp.expect_failure('select public.criar_turma_planejada(pg_temp.course_request(),false)','não tem permissão');
select set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);
reset role;
select pg_temp.assert_ok(not has_function_privilege('anon','public.criar_turma_planejada(jsonb,boolean,jsonb)','EXECUTE'),'anon não cria cronograma');
select pg_temp.assert_ok(not has_function_privilege('anon','public.consultar_base_cronograma(uuid,uuid,date,date,text)','EXECUTE'),'anon não consulta cronograma');
\echo 'OK: criação transacional, prévia sem escrita, conflitos após prévia, isolamento, 50 min, idempotência e rollback.'
