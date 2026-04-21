
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Credenciais do projeto eduplanner-prod (ubhtibihkpwocgazwtur)
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) {
    console.error('ERROR: SUPABASE_SERVICE_KEY env variable not set.');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function applyMigration() {
    console.log('=== Applying Migration 014: Enforce RLS ===');
    console.log('Project: eduplanner-prod (ubhtibihkpwocgazwtur)');
    console.log('');

    const sqlPath = './supabase/migrations/014_enforce_rls_all_tables.sql';
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Quebrar em statements separados para execução individual
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
        try {
            const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
            if (error) {
                console.warn(`⚠️  Warning: ${error.message}`);
                errorCount++;
            } else {
                successCount++;
            }
        } catch (err) {
            console.warn(`⚠️  Skip: ${err.message}`);
        }
    }

    console.log(`\n✅ Done. ${successCount} statements applied, ${errorCount} warnings.`);
}

applyMigration();
