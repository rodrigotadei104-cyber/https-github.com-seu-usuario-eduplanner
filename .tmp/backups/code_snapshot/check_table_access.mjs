import { createClient } from '@supabase/supabase-js';
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function listTables() {
    // We can't list tables directly via postgrest with anon key usually, unless we have a specific function exposed.
    // But we can try to assume 'aulas' works since our app works.

    // Let's try to select from 'aulas' again.
    const { data, error } = await supabase.from('aulas').select('id').limit(1);
    if (error) {
        console.log('Error selecting from aulas: ', error.message);
    } else {
        console.log('Successfully selected from aulas. Table exists to the API.');
    }

    // If we want to check schema, normally we query information_schema but RLS might block.
    // Let's try a direct query if possible? No direct SQL here.
}

listTables();
