import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function listAllData() {
    console.log('Querying courses...');
    const { data: courses, error: errC } = await supabase.from('cursos').select('*');
    if (errC) {
        console.error('Error fetching courses:', errC);
    } else {
        console.log(`Found ${courses.length} courses:`);
        courses.forEach(c => {
            console.log(`  - [${c.id}] ${c.nome} (Tenant: ${c.tenant_id})`);
        });
    }

    console.log('\nQuerying all aulas...');
    const { data: aulas, error: errA } = await supabase.from('aulas').select('*');
    if (errA) {
        console.error('Error fetching aulas:', errA);
    } else {
        console.log(`Found ${aulas.length} total aulas:`);
        if (aulas.length > 0) {
            aulas.forEach(a => {
                console.log(`  - ID: ${a.id} | Data: ${a.data} | CursoID: ${a.curso_id} | Turma: "${a.numero_turma}" | Status: ${a.status}`);
            });
        }
    }
}

listAllData();
