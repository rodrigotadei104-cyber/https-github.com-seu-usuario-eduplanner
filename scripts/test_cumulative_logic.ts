
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- Test Cumulative Logic ---');

    const { data: allAulas, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('curso_id', '3d259458-5b40-488b-ba8b-60c7fe46e35a'); // Use the ID found in previous debug

    if (error) { console.error(error); return; }

    // Normalize data shape to match React component expectations
    const normalizedAulas = allAulas?.map(a => ({
        id: a.id,
        cursoId: a.curso_id,
        numeroTurma: a.numero_turma,
        data: a.data,
        horarioInicio: a.horario_inicio,
        horarioFim: a.horario_fim,
        status: a.status === 'em_andamento' ? 'em-andamento' : a.status
    }));

    console.log(`Loaded ${normalizedAulas?.length} classes.`);

    // --- LOGIC FROM DailyView.tsx ---
    const map: Record<string, number> = {};
    const courseMap: Record<string, any[]> = {};

    normalizedAulas?.forEach(a => {
        if (!a.cursoId) return;
        const key = `${a.cursoId}::${a.numeroTurma || 'default'}`;
        if (!courseMap[key]) courseMap[key] = [];
        courseMap[key].push(a);
    });

    Object.values(courseMap).forEach(group => {
        // Sort
        group.sort((a, b) => {
            const dateA = new Date(`${a.data}T${a.horarioInicio}`);
            const dateB = new Date(`${b.data}T${b.horarioInicio}`);
            return dateA.getTime() - dateB.getTime();
        });

        let runningTotal = 0;
        group.forEach(a => {
            const [h1, m1] = a.horarioInicio.split(':').map(Number);
            const [h2, m2] = a.horarioFim.split(':').map(Number);
            const dur = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;

            if (a.status === 'concluida' || a.status === 'em-andamento') {
                runningTotal += dur;
                map[a.id] = runningTotal;
            } else {
                map[a.id] = runningTotal;
            }

            console.log(`ID: ${a.id} | Date: ${a.data} ${a.horarioInicio} | Status: ${a.status} | Added: ${dur} | MapVal: ${map[a.id]}`);
        });
    });

    console.log('--- End ---');
}

run();
