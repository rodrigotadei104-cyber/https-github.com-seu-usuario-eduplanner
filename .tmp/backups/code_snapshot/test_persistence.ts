
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPersistence() {
    console.log('1. Fetching one class...');
    const { data: list, error: listError } = await supabase.from('aulas').select('id, numero_turma').limit(1);

    if (listError || !list || list.length === 0) {
        console.error('Failed to fetch class', listError);
        return;
    }

    const targetId = list[0].id;
    const originalVal = list[0].numero_turma;
    console.log(`Target Class ID: ${targetId}`);
    console.log(`Original numero_turma: ${originalVal}`);

    const testVal = "TEST-" + Math.floor(Math.random() * 1000);
    console.log(`2. Updating to: ${testVal} ...`);

    const { error: updateError } = await supabase
        .from('aulas')
        .update({ numero_turma: testVal })
        .eq('id', targetId);

    if (updateError) {
        console.error('Update Failed:', updateError);
        return;
    }

    console.log('Update command sent (no error).');

    console.log('3. Reading back...');
    const { data: verify, error: verifyError } = await supabase
        .from('aulas')
        .select('id, numero_turma')
        .eq('id', targetId)
        .single();

    if (verifyError) {
        console.error('Read back failed', verifyError);
        return;
    }

    console.log(`Read back value: ${verify.numero_turma}`);

    if (verify.numero_turma === testVal) {
        console.log('✅ SUCCESS: Persistence verified.');

        // Cleanup - revert
        console.log('4. Reverting to original value...');
        await supabase.from('aulas').update({ numero_turma: originalVal }).eq('id', targetId);
        console.log('Reverted.');
    } else {
        console.log('❌ FAILURE: Value did not persist.');
    }
}

testPersistence();
