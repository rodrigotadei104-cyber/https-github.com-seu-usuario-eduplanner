
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function inspectCourse() {
    console.log('Fetching all courses containing "Empilhadeira"...');
    const { data: cursoData } = await supabase.from('cursos').select('*').ilike('nome', '%Empilhadeira%');

    if (!cursoData || cursoData.length === 0) {
        console.log('Course not found');
        return;
    }

    const cursoIds = cursoData.map(c => c.id);
    console.log(`Found ${cursoData.length} course(s): ${cursoData.map(c => c.nome).join(', ')}`);

    const { data: aulas, error } = await supabase
        .from('aulas')
        .select('*')
        .in('curso_id', cursoIds)
        .order('data', { ascending: true });

    if (error) {
        console.error('Error fetching aulas:', error);
        return;
    }

    console.log(`\nFound ${aulas.length} total classes for this course.`);

    const turmas = {};
    aulas.forEach(a => {
        const tKey = a.numero_turma || 'SEM_TURMA';
        if (!turmas[tKey]) turmas[tKey] = [];
        turmas[tKey].push(a);
    });

    Object.keys(turmas).forEach(t => {
        console.log(`\n--- TURMA: ${t} (${turmas[t].length} aulas) ---`);
        turmas[t].forEach(a => {
            console.log(`  [${a.data}] ${a.horario_inicio}-${a.horario_fim} | Sala: "${a.sala}" | Status: ${a.status}`);
        });
    });
}

inspectCourse();
