import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

// Backend local em modo single-user: não abre conexões TCP nem usa credenciais de produção.
const cluster = resolve('.tmp/turma-change-postgres');
const binary = process.env.EDUPLANNER_TEST_POSTGRES || 'C:/Program Files/PostgreSQL/18/bin/postgres.exe';
if (!cluster.startsWith(resolve('.tmp') + sep) || existsSync(resolve(cluster, 'postmaster.pid'))) {
    throw new Error('Use somente o cluster de testes parado em .tmp/turma-change-postgres.');
}
const run = (database, sql) => spawnSync(binary,
    ['--single', '-D', cluster, '-j', '-c', 'log_min_error_statement=panic', database],
    { input: sql + '\n\n', encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const create = run('postgres', 'create database eduplanner_turma_changes_test;');
if ((create.status !== 0 || /(?:ERROR|FATAL):/.test(create.stderr || '')) && !/database "eduplanner_turma_changes_test" already exists/.test(create.stderr || '')) {
    throw new Error((create.stderr || create.error?.message || 'Erro ao criar banco de teste').slice(-2000));
}
let sql = readFileSync(new URL('./test_turma_changes.sql', import.meta.url), 'utf8');
sql = sql.replace(/^\\ir (.*)$/gm, (_line, file) => readFileSync(new URL(file.trim(), new URL('./test_turma_changes.sql', import.meta.url)), 'utf8'))
    .replace(/^\\.*$/gm, '');
const result = run('eduplanner_turma_changes_test', sql);
if (result.status !== 0 || /(?:ERROR|FATAL):/.test(result.stderr || '')) throw new Error((result.stderr || result.stdout || result.error?.message || 'Teste SQL falhou').slice(-3500));
console.log('OK: PostgreSQL real validou prévia, troca, RLS, permissões, conflitos, férias, dados obsoletos e rollback integral.');
