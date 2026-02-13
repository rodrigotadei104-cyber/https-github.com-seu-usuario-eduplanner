
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumn() {
    console.log('Checking Aulas table columns...');

    // Try to insert a dummy record with numero_turma to see if it fails OR just select
    // Selecting is safer.
    const { data, error } = await supabase.from('aulas').select('*').limit(1);

    if (error) {
        console.error('Error selecting:', error);
        return;
    }

    if (data && data.length > 0) {
        const keys = Object.keys(data[0]);
        console.log('Columns found:', keys);
        if (keys.includes('numero_turma')) {
            console.log('✅ Column numero_turma EXISTS.');
        } else {
            console.log('❌ Column numero_turma MISSING.');
        }
    } else {
        console.log('No data in Aulas to check columns. Attempting to list table info via RPC or just assuming missing if save failed?');
    }
}

checkColumn();
