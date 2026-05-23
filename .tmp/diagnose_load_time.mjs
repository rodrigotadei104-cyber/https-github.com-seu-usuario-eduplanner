import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

console.log('=== DIAGNÓSTICO DE PERFORMANCE DO EDUPLANNER ===\n');

// 1. Count total
const t0 = Date.now();
const { count } = await supabase.from('aulas').select('*', { count: 'exact', head: true });
console.log(`[COUNT]  Total aulas no banco: ${count} (${Date.now()-t0}ms)`);

// 2. Select simples (sem JOINs)
const t1 = Date.now();
const { data: d1 } = await supabase.from('aulas').select('*').range(0, 999);
console.log(`[SIMPLE] Aulas sem JOIN (0-999): ${d1?.length} rows (${Date.now()-t1}ms)`);

// 3. Select COM JOINs (como o aulaService.list faz)
const t2 = Date.now();
const { data: d2 } = await supabase.from('aulas').select(`*, numero_turma, carga_horaria_materia, tipo_aula, origem, contabiliza_carga, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor, minutos_por_hora, numero_curso), materia:materias(id, nome, carga_horaria), disciplina:disciplinas_curso(id, nome_disciplina, curso:catalogo_cursos(id, nome_curso))`).range(0, 999);
console.log(`[JOIN]   Aulas COM JOINs (0-999): ${d2?.length} rows (${Date.now()-t2}ms)`);

// 4. Se há mais de 1000 aulas → testar paginação sequencial
if (count > 1000) {
  const t3 = Date.now();
  let all = [], s = 0, pages = 0;
  while (true) {
    const tPage = Date.now();
    const { data } = await supabase.from('aulas').select(`*, numero_turma, carga_horaria_materia, tipo_aula, origem, contabiliza_carga, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor, minutos_por_hora, numero_curso), materia:materias(id, nome, carga_horaria), disciplina:disciplinas_curso(id, nome_disciplina, curso:catalogo_cursos(id, nome_curso))`).order('data', { ascending: true }).range(s, s + 999);
    pages++;
    console.log(`  Página ${pages} (${s}-${s+999}): ${data?.length} rows (${Date.now()-tPage}ms)`);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
    s += 1000;
  }
  console.log(`[PAGES]  Total: ${all.length} aulas em ${pages} páginas (${Date.now()-t3}ms)`);
} else {
  console.log(`[PAGES]  Paginação não necessária (${count} <= 1000)`);
}

// 5. Testar cada service isolado
console.log('\n--- SERVIÇOS INDIVIDUAIS ---');
const t4 = Date.now();
const { data: instData } = await supabase.from('instrutores').select('*').eq('active', true).order('nome');
console.log(`[INST]   ${instData?.length} instrutores (${Date.now()-t4}ms)`);

const t5 = Date.now();
const { data: curData } = await supabase.from('cursos').select('*, raw_mins:minutos_por_hora').order('nome');
console.log(`[CURSO]  ${curData?.length} cursos (${Date.now()-t5}ms)`);

const t6 = Date.now();
const { data: matData } = await supabase.from('materias').select('*, curso:cursos(id, nome)').order('nome');
console.log(`[MAT]    ${matData?.length} materias (${Date.now()-t6}ms)`);

const t7 = Date.now();
const { data: evtData } = await supabase.from('eventos').select('*');
console.log(`[EVENT]  ${evtData?.length || 0} eventos (${Date.now()-t7}ms)`);

const t8 = Date.now();
const { data: ferData } = await supabase.from('feriados').select('*').eq('ativo', true).order('data');
console.log(`[FER]    ${ferData?.length || 0} feriados (${Date.now()-t8}ms)`);

// 6. Sync status
const t9 = Date.now();
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const { data: syncD } = await supabase.from('aulas').select('id, data, horario_inicio, horario_fim, status').neq('status', 'cancelada').neq('status', 'concluida').lte('data', todayStr);
console.log(`[SYNC]   ${syncD?.length || 0} aulas pendentes de sync (${Date.now()-t9}ms)`);

// 7. SIMULAÇÃO COMPLETA DO CARREGAMENTO
console.log('\n=== SIMULAÇÃO DO PROMISE.ALL (como loadAllData) ===');
const tAll = Date.now();
await Promise.all([
  (async () => { const t=Date.now(); let a=[],s=0; while(true){const{data}=await supabase.from('aulas').select(`*, numero_turma, carga_horaria_materia, tipo_aula, origem, contabiliza_carga, instrutor:instrutores(id, nome), curso:cursos(id, nome, cor, minutos_por_hora, numero_curso), materia:materias(id, nome, carga_horaria), disciplina:disciplinas_curso(id, nome_disciplina, curso:catalogo_cursos(id, nome_curso))`).order('data',{ascending:true}).range(s,s+999);a.push(...(data||[]));if(!data||data.length<1000)break;s+=1000;}console.log(`  Aulas: ${a.length} rows (${Date.now()-t}ms)`);})(),
  (async () => { const t=Date.now(); await supabase.from('instrutores').select('*').eq('active',true); console.log(`  Inst: (${Date.now()-t}ms)`);})(),
  (async () => { const t=Date.now(); await supabase.from('cursos').select('*'); console.log(`  Cursos: (${Date.now()-t}ms)`);})(),
  (async () => { const t=Date.now(); await supabase.from('materias').select('*'); console.log(`  Mat: (${Date.now()-t}ms)`);})(),
  (async () => { const t=Date.now(); await supabase.from('eventos').select('*'); console.log(`  Eventos: (${Date.now()-t}ms)`);})(),
  (async () => { const t=Date.now(); await supabase.from('feriados').select('*').eq('ativo',true); console.log(`  Fer: (${Date.now()-t}ms)`);})(),
]);
console.log(`\n⏱️  TEMPO TOTAL DO PROMISE.ALL: ${Date.now()-tAll}ms\n`);
