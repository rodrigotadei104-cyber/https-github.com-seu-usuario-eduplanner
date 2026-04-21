
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!anonKey) {
    console.error('ERROR: VITE_SUPABASE_ANON_KEY env variable not set.');
    process.exit(1);
}

const supabase = createClient(url, anonKey);

async function backupData() {
    console.log('=== Iniciando Backup de Segurança (Tabela Aulas) ===');

    try {
        const { data: aulas, error } = await supabase
            .from('aulas')
            .select('*');

        if (error) {
            console.error('Erro ao buscar aulas para backup:', error.message);
            return;
        }

        const backupFile = `./backup_aulas_pre_hardening_${Date.now()}.json`;
        fs.writeFileSync(backupFile, JSON.stringify(aulas, null, 2));

        console.log(`✅ Backup concluído com sucesso: ${backupFile}`);
        console.log(`Total de registros salvos: ${aulas ? aulas.length : 0}`);

    } catch (err) {
        console.error('Erro fatal no backup:', err.message);
    }
}

backupData();
