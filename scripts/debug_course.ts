
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Or service role if needed

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- Debug Course Progress ---');

    // 1. Find the course (Assuming 'Empilhadeira' is in the name)
    const { data: courses, error: cErr } = await supabase
        .from('cursos')
        .select('*')
        .ilike('nome', '%Empilhadeira%');

    if (cErr) { console.error(cErr); return; }
    if (!courses || courses.length === 0) { console.log('No course found'); return; }

    console.log(`Found ${courses.length} courses.`);

    for (const course of courses) {
        console.log(`\nCOURSE: ${course.nome} (ID: ${course.id}) - Target: ${course.carga_horaria}`);

        // 2. Fetch Classes
        const { data: aulas, error: aErr } = await supabase
            .from('aulas')
            .select('id, data, horario_inicio, horario_fim, status, materia_id, numero_turma')
            .eq('curso_id', course.id)
            .order('data', { ascending: true });

        if (aErr) { console.error(aErr); continue; }

        console.log(`Found ${aulas?.length} classes.`);

        let strictSum = 0;
        let activeSum = 0;
        let totalScheduled = 0;

        aulas?.forEach(a => {
            const [h1, m1] = a.horario_inicio.split(':').map(Number);
            const [h2, m2] = a.horario_fim.split(':').map(Number);
            const dur = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;

            console.log(`- ${a.data} [${a.horario_inicio}-${a.horario_fim}] (${dur}h) Status: ${a.status}`);

            totalScheduled += dur;
            if (['concluida'].includes(a.status)) strictSum += dur;
            if (['em-andamento', 'em_andamento'].includes(a.status)) activeSum += dur;
        });

        console.log(`\nSUMMARY:`);
        console.log(`Strict Completed: ${strictSum}h`);
        console.log(`Active: ${activeSum}h`);
        console.log(`Total Realized (Strict+Active): ${strictSum + activeSum}h`);
        console.log(`Total Scheduled (All): ${totalScheduled}h`);
    }
}

run();
