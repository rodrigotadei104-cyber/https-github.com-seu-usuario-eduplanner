import { createClient } from '@supabase/supabase-js';
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('aulas').select('numero_turma').limit(1);
    if (error) {
        console.log('ERROR: ' + error.message);
    } else {
        console.log('SUCCESS: Column numero_turma exists accessbile.');
    }
}

check();
