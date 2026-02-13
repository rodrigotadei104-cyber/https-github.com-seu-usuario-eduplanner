
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('Inspecting data for 2026-02-07...');

    // Fetch all classes for the specific date
    // Note: The format in the DB is YYYY-MM-DD for the 'data' column (usually text or date)
    const targetDate = '2026-02-07';

    const { data, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('data', targetDate);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(`Found ${data.length} classes for ${targetDate}`);

    data.forEach((aula, index) => {
        console.log(`\n[${index + 1}] ID: ${aula.id}`);
        console.log(`    Instructor: "${aula.instrutor}"`); // Quote to see whitespace
        console.log(`    Status:     ${aula.status}`);
        console.log(`    Subject:    ${aula.materia}`);
        console.log(`    Time:       ${aula.horario_inicio} - ${aula.horario_fim}`);
        console.log(`    TenantID:   ${aula.tenant_id}`);
        console.log(`    Course:     ${aula.curso}`);
        console.log(`    Created At: ${aula.created_at || 'N/A'}`);
    });

    // Check for potential duplicates (same time/instructor)
    console.log('\n--- Checking for potential semantic duplicates ---');
    for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
            const a = data[i];
            const b = data[j];

            // Check overlap
            if (a.instrutor === b.instrutor && a.horario_inicio === b.horario_inicio) {
                console.warn(`POTENTIAL DUPLICATE FOUND:\n  A: ${a.id} (${a.status})\n  B: ${b.id} (${b.status})`);
            }
        }
    }
}

inspectData();
