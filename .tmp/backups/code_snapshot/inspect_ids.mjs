
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function inspectData() {
    console.log('Inspecting data for 2026-02-07...');
    const targetDate = '2026-02-07';

    // Fetch all classes regardless of status
    const { data: allData, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('data', targetDate);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(`\nFound ${allData.length} records for ${targetDate}`);

    allData.forEach(aula => {
        console.log(`ID: ${aula.id}`);
        console.log(`  instrutor: ${aula.instrutor}`);
        console.log(`  instrutor_id: ${aula.instrutor_id}`);
        console.log(`  materia: ${aula.materia}`);
        console.log(`  materia_id: ${aula.materia_id}`);
        console.log(`  status: ${aula.status}`);
        console.log('---');
    });
}

inspectData();
