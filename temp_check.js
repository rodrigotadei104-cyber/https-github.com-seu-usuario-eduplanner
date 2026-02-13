const { createClient } = require('@supabase/supabase-js');
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function check() {
    const { data: insts } = await supabase.from('instrutores').select('id, nome');
    console.log('--- INSTRUTORES ---');
    console.log(JSON.stringify(insts, null, 2));

    if (insts) {
        const ids = insts.map(i => i.id);
        const { data: aulas } = await supabase.from('aulas')
            .select('data, instrutor_id, carga_horaria_materia, horario_inicio, horario_fim, status')
            .gte('data', '2026-01-01')
            .lte('data', '2026-12-31')
            .in('instrutor_id', ids);
        console.log('--- AULAS 2026 ---');
        console.log(JSON.stringify(aulas, null, 2));
    }
}

check();
