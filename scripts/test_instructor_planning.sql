-- Fixture local em transação, não executar diretamente em produção.
do $$ declare
 teacher uuid := '20000000-0000-0000-0000-000000000001';
 unit uuid := '10000000-0000-0000-0000-000000000001';
 day date := (current_timestamp at time zone 'America/Sao_Paulo')::date;
 saved jsonb; changed jsonb; result jsonb; before_count integer; version timestamptz;
begin
 perform pg_temp.assert_ok(row_security_active('public.instrutor_rotinas'),'RLS efetivamente ativa para '||current_user);
 perform pg_temp.assert_ok(public.validar_rotina_instrutor('[]'),'rotina vazia é configuração explícita válida');
 perform pg_temp.assert_ok(not public.validar_rotina_instrutor('[{"dia":1,"inicio":"12:00","fim":"08:00"}]'),'recusa intervalo invertido');
 perform pg_temp.assert_ok(not public.validar_rotina_instrutor('[{"dia":1,"inicio":"08:00","fim":"12:00"},{"dia":1,"inicio":"11:00","fim":"13:00"}]'),'recusa sobreposição');
 perform pg_temp.assert_ok(not public.validar_rotina_instrutor('{"dia":1}'),'recusa JSON que não é array');
 saved := public.salvar_rotina_instrutor(teacher,'[{"dia":1,"inicio":"08:00","fim":"12:00"}]',null);
 version := (saved->>'updated_at')::timestamptz;
 perform pg_temp.assert_ok(saved->'janelas'->0->>'inicio'='08:00','salva rotina da unidade');
 perform pg_temp.expect_failure(format('select public.salvar_rotina_instrutor(%L,%L,null)',teacher,'[]'),'outro usuário');
 changed := public.salvar_rotina_instrutor(teacher,'[{"dia":1,"inicio":"09:00","fim":"12:00"}]',version);
 perform pg_temp.expect_failure($q$update public.instrutor_rotinas set tenant_id='10000000-0000-0000-0000-000000000002' where instrutor_id='20000000-0000-0000-0000-000000000001'$q$,'row-level security');
 perform pg_temp.assert_ok((changed->>'updated_at')::timestamptz>version,'atualiza versão da rotina');
 perform pg_temp.expect_failure(format('select public.salvar_rotina_instrutor(%L,%L,%L)',teacher,'[]',version),'outro usuário');
 perform pg_temp.expect_failure($q$select public.salvar_rotina_instrutor('20000000-0000-0000-0000-000000000003','[]',null)$q$,'indisponível');
 perform pg_temp.expect_failure($q$insert into public.instrutor_rotinas(tenant_id,instrutor_id,janelas,updated_by) values('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','[]',auth.uid())$q$,'row-level security');
 insert into public.aulas(id,tenant_id,instrutor_id,data,horario_inicio,horario_fim,status,nome_instrutor,numero_turma) values
 ('90000000-0000-0000-0000-000000000001',unit,teacher,day+14,'08:00','10:00','agendada','Antigo','NOVA'),
 ('90000000-0000-0000-0000-000000000002',unit,null,day+14,'11:00','12:00','agendada','Antigo','LEGADA'),
 ('90000000-0000-0000-0000-000000000003',unit,'20000000-0000-0000-0000-000000000002',day+14,'13:00','14:00','agendada','Antigo','OUTRO ID'),
 ('90000000-0000-0000-0000-000000000004',unit,teacher,day+14,'15:00','16:00','cancelada','Antigo','CANCELADA'),
 ('90000000-0000-0000-0000-000000000005',unit,teacher,day-7,'08:00','12:00','concluida','Antigo','HISTÓRICO');
 insert into public.events values ('90000000-0000-0000-0000-000000000006',unit,teacher,null,'Férias',day+15,'00:00','00:00','ferias','agendado');
 insert into public.feriados values('90000000-0000-0000-0000-000000000007',unit,day+16,'Feriado',true);
 insert into public.datas_bloqueadas values('90000000-0000-0000-0000-000000000008',unit,day+17,'Recesso',true);
 select count(*) into before_count from public.aulas;
 result := public.consultar_planejamento_instrutor(teacher,day+14,day+20);
 perform pg_temp.assert_ok(jsonb_array_length(result->'aulas')=2,'consulta todas as aulas pertinentes; ID prevalece sobre nome');
 perform pg_temp.assert_ok(result->'aulas'->1->>'legacy'='true','inclui ocupação legada pelo nome');
 perform pg_temp.assert_ok(jsonb_array_length(result->'historico')=1,'histórico apenas anterior à consulta e não cancelado');
 perform pg_temp.assert_ok(result->'eventos'->0->>'diaInteiro'='true','férias são dia inteiro');
 perform pg_temp.assert_ok(jsonb_array_length(result->'feriados')=1 and jsonb_array_length(result->'bloqueios')=1,'carrega calendário completo');
 perform pg_temp.assert_ok(result->'routine'->'janelas'->0->>'inicio'='09:00','consulta rotina persistida');
 perform pg_temp.assert_ok((select count(*)=before_count from public.aulas),'consultar planejamento não cria aulas');
 perform pg_temp.expect_failure(format('select public.consultar_planejamento_instrutor(%L,%L,%L)',teacher,day-1,day+10),'período futuro');
 perform pg_temp.expect_failure(format('select public.consultar_planejamento_instrutor(%L,%L,%L)',teacher,day,day+180),'180 dias');
 perform pg_temp.expect_failure(format('select public.consultar_planejamento_instrutor(%L,%L,%L)','20000000-0000-0000-0000-000000000003',day,day+10),'indisponível');
 perform set_config('test.user_id','00000000-0000-0000-0000-000000000002',true);
 result := public.consultar_planejamento_instrutor(teacher,day+14,day+20);
 perform pg_temp.assert_ok(jsonb_array_length(result->'aulas')=2,'viewer pode consultar');
 perform pg_temp.expect_failure(format('select public.salvar_rotina_instrutor(%L,%L,%L)',teacher,'[]',changed->>'updated_at'),'Sem permissão');
 perform set_config('test.user_id','00000000-0000-0000-0000-000000000003',true);
 perform pg_temp.expect_failure(format('select public.consultar_planejamento_instrutor(%L,%L,%L)',teacher,day,day+10),'Sem permissão');
 perform set_config('test.user_id','00000000-0000-0000-0000-000000000001',true);
end $$;
reset role;
create function pg_temp.fail_routine_audit() returns trigger language plpgsql as $$ begin
 if new.details->>'type'='INSTRUCTOR_ROUTINE' then raise exception 'Falha de auditoria simulada'; end if; return new;
end $$;
create trigger fail_routine_audit before insert on public.audit_logs for each row execute function pg_temp.fail_routine_audit();
set role authenticated;
do $$ declare previous public.instrutor_rotinas%rowtype;
begin
 select * into previous from public.instrutor_rotinas where instrutor_id='20000000-0000-0000-0000-000000000001';
 perform pg_temp.expect_failure(format('select public.salvar_rotina_instrutor(%L,%L,%L)',previous.instrutor_id,'[]',previous.updated_at),'Falha de auditoria simulada');
 perform pg_temp.assert_ok((select updated_at=previous.updated_at and janelas=previous.janelas from public.instrutor_rotinas where instrutor_id=previous.instrutor_id),'falha de auditoria reverte alteração da rotina');
end $$;
reset role;
drop trigger fail_routine_audit on public.audit_logs;
select pg_temp.assert_ok(not has_function_privilege('anon','public.consultar_planejamento_instrutor(uuid,date,date)','execute'),'anon não consulta planejamento');
select pg_temp.assert_ok(not has_function_privilege('anon','public.salvar_rotina_instrutor(uuid,jsonb,timestamptz)','execute'),'anon não salva rotina');
select pg_temp.assert_ok(not has_table_privilege('anon','public.instrutor_rotinas','select'),'anon não lê rotinas');
set role authenticated;
