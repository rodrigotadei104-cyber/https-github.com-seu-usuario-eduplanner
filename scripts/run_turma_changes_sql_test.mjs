import { existsSync } from 'node:fs';
import { resolve, sep, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Servidor descartável local normal: --single não aplica RLS, mesmo após SET ROLE.
const cluster=resolve('.tmp/turma-change-postgres');
const binary=process.env.EDUPLANNER_TEST_POSTGRES||'C:/Program Files/PostgreSQL/18/bin/postgres.exe';
const bin=dirname(binary),port=Number(process.env.EDUPLANNER_TEST_PORT||55439);
if(!cluster.startsWith(resolve('.tmp')+sep)||existsSync(join(cluster,'postmaster.pid'))||!existsSync(join(cluster,'PG_VERSION'))
 ||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use apenas o cluster descartável inicializado e parado em .tmp/turma-change-postgres.');
// pg_ctl inicia um descendente persistente; pipes herdados podem prender spawnSync no Windows.
const run=(name,args)=>spawnSync(join(bin,name),args,{encoding:'utf8',maxBuffer:4*1024*1024,
 ...(name==='pg_ctl.exe'?{stdio:'ignore'}:{})});
const check=(result,label)=>{if(result.status!==0)throw new Error(`${label}: ${(result.stderr||result.stdout||result.error?.message||'falha').slice(-3500)}`);return result;};
const connection=['-X','-h','127.0.0.1','-p',String(port),'-U','postgres'];
let started=false;
try{
 check(run('pg_ctl.exe',['-D',cluster,'-l',resolve('.tmp/planning-postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']),'Iniciar servidor local');started=true;
 const exists=check(run('psql.exe',[...connection,'-d','postgres','-Atc',"select 1 from pg_database where datname='eduplanner_turma_changes_test'"]),'Conferir banco de teste');
 if(!exists.stdout.trim())check(run('psql.exe',[...connection,'-d','postgres','-v','ON_ERROR_STOP=1','-c','create database eduplanner_turma_changes_test']),'Criar banco de teste');
 check(run('psql.exe',[...connection,'-d','eduplanner_turma_changes_test','-v','ON_ERROR_STOP=1','-q','-f',resolve('scripts/test_turma_changes.sql')]),'Testes SQL');
 console.log('OK: PostgreSQL normal validou planejamento, RLS efetiva, rotinas, isolamento, reagendamentos, conflitos e rollback integral.');
}finally{if(started)check(run('pg_ctl.exe',['-D',cluster,'-m','fast','-w','stop']),'Encerrar servidor local');}
