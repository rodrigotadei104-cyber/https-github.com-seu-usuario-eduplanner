do $$ declare
 teacher uuid:='20000000-0000-0000-0000-000000000001';
 first_day date:=(current_timestamp at time zone 'America/Sao_Paulo')::date+14;
 previous public.instrutor_rotinas%rowtype; result jsonb; loaded jsonb; pauses jsonb;
begin
 select * into previous from public.instrutor_rotinas where instrutor_id=teacher;
 pauses:=jsonb_build_array(jsonb_build_object('dia',extract(dow from first_day)::integer,'inicio','18:00','fim','19:00','descricao','Janta'));
 result:=public.salvar_rotina_instrutor(teacher,previous.janelas,previous.updated_at,pauses);
 perform pg_temp.assert_ok(result->'pausas'=pauses,'salva pausa protegida com a jornada');
 loaded:=public.consultar_planejamento_instrutor(teacher,first_day,first_day+6);
 perform pg_temp.assert_ok(loaded->'routine'->'pausas'=pauses,'consulta retorna pausa salva');
 perform pg_temp.assert_ok(exists(select 1 from jsonb_array_elements(loaded->'eventos') e where e->>'protegido'='true' and e->>'inicio'='18:00' and e->>'fim'='19:00'),'clientes antigos também recebem a janta como ocupação');
 result:=public.salvar_rotina_instrutor(teacher,previous.janelas,(result->>'updated_at')::timestamptz);
 perform pg_temp.assert_ok(result->'pausas'=pauses,'chamada antiga de três argumentos preserva pausas');
 perform pg_temp.expect_failure(format('select public.salvar_rotina_instrutor(%L,%L,%L,%L)',teacher,previous.janelas,result->>'updated_at','[{"dia":1,"inicio":"19:00","fim":"18:00"}]'),'intervalos protegidos');
 perform pg_temp.assert_ok(not public.validar_pausas_instrutor('[{"dia":1,"inicio":"18:00","fim":"19:00","descricao":42}]'),'descrição inválida é recusada');
 perform pg_temp.assert_ok(not has_function_privilege('anon','public.validar_pausas_instrutor(jsonb)','execute'),'anon não executa validador');
end $$;
