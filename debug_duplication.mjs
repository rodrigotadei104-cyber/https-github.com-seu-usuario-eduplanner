
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function findDuplicatedClasses() {
    console.log('Searching for "RUMO" or "Fora da Unidade" in classes...');

    // 1. Encontrar aulas que contenham "Rumo" ou "Fora da Unidade"
    const { data: rumoClasses, error } = await supabase
        .from('aulas')
        .select('*, curso:cursos(nome)')
        .ilike('sala', '%Rumo%');

    if (error) {
        console.error('Error fetching RUMO classes:', error);
        return;
    }

    if (rumoClasses.length === 0) {
        console.log('No classes found with "Rumo" in the room name.');
        return;
    }

    console.log(`\nFound ${rumoClasses.length} classes with "Rumo":`);

    for (const aula of rumoClasses) {
        console.log(`\n--- TURMA: ${aula.numero_turma} | CURSO: ${aula.curso?.nome} ---`);
        console.log(`ID: ${aula.id} | Sala: "${aula.sala}" | Data: ${aula.data}`);

        // 2. Buscar outras aulas DA MESMA TURMA/CURSO que NÃO estão na sala do Rumo
        const { data: siblingClasses, error: siblingError } = await supabase
            .from('aulas')
            .select('id, data, sala, status')
            .eq('curso_id', aula.curso_id)
            .eq('numero_turma', aula.numero_turma)
            .neq('sala', aula.sala || '');

        if (siblingError) {
            console.error('Error fetching sibling classes:', siblingError);
            continue;
        }

        if (siblingClasses.length > 0) {
            console.log(`  WARNING: Found ${siblingClasses.length} sibling classes in DIFFERENT rooms:`);
            siblingClasses.forEach(s => {
                console.log(`    - ID: ${s.id} | Sala: "${s.sala}" | Data: ${s.data} | Status: ${s.status}`);
            });
        } else {
            console.log('  Consistent: No sibling classes in other rooms found.');
        }
    }
}

findDuplicatedClasses();
