import { createClient } from '@supabase/supabase-js';
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function check() {
    const { data: aulas } = await supabase.from('aulas')
        .select('data, instrutor:instrutores(nome), status, carga_horaria_materia, horario_inicio, horario_fim, curso:cursos(minutos_por_hora)')
        .gte('data', '2026-01-26')
        .lte('data', '2026-01-26')
        .limit(5);

    console.log('--- RAW JOIN RESULT ---');
    console.log(JSON.stringify(aulas, null, 2));
}

check();
