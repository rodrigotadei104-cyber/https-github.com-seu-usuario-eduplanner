
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

    // Group by Instructor
    const byInstructor = {};
    allData.forEach(aula => {
        const key = aula.instrutor || 'UNASSIGNED';
        if (!byInstructor[key]) byInstructor[key] = [];
        byInstructor[key].push(aula);
    });

    console.log('\n--- BY INSTRUCTOR ---');
    Object.keys(byInstructor).forEach(instr => {
        console.log(`\nInstructor: "${instr}" (${byInstructor[instr].length} classes)`);
        byInstructor[instr].forEach(a => {
            console.log(`  [${a.status.padEnd(12)}] ${a.horario_inicio}-${a.horario_fim} | ${a.materia} (ID: ${a.id})`);
        });
    });

    console.log('\n--- POTENTIAL DUPLICATES ---');
    // Check overlapping times for same instructor
    Object.keys(byInstructor).forEach(instr => {
        const classes = byInstructor[instr];
        for (let i = 0; i < classes.length; i++) {
            for (let j = i + 1; j < classes.length; j++) {
                const a = classes[i];
                const b = classes[j];
                if (a.horario_inicio === b.horario_inicio) {
                    console.log(`  WARNING: Overlap for ${instr} at ${a.horario_inicio}`);
                    console.log(`    1. ${a.id} (${a.status}) - ${a.materia}`);
                    console.log(`    2. ${b.id} (${b.status}) - ${b.materia}`);
                }
            }
        }
    });
}

inspectData();
