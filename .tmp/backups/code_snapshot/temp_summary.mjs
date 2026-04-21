import { createClient } from '@supabase/supabase-js';
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function check() {
    const { data: aulas } = await supabase.from('aulas')
        .select('instrutor:instrutores(nome), carga_horaria_materia, horario_inicio, horario_fim, curso:cursos(minutos_por_hora)')
        .gte('data', '2026-01-01')
        .lte('data', '2026-12-31');

    const summary = {};
    aulas?.forEach(a => {
        const nome = a.instrutor?.nome || 'Desconhecido';
        let h = 0;
        if (a.carga_horaria_materia) h = Number(a.carga_horaria_materia);
        else if (a.horario_inicio && a.horario_fim) {
            const [h1, m1] = a.horario_inicio.split(':').map(Number);
            const [h2, m2] = a.horario_fim.split(':').map(Number);
            h = ((h2 * 60 + m2) - (h1 * 60 + m1)) / (a.curso?.minutos_por_hora || 60);
        }
        summary[nome] = (summary[nome] || 0) + h;
    });

    console.log('--- SUMMARY 2026 ---');
    console.log(JSON.stringify(summary, null, 2));
}

check();
