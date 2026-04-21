
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env variable not set.');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

const TABLES = [
    'tenants',
    'users',
    'instrutores',
    'cursos',
    'materias',
    'aulas',
    'audit_logs'
];

async function backupAllData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join('.tmp', 'backups', `data_${timestamp}`);

    console.log(`=== Iniciando Backup Total de Produção [${timestamp}] ===`);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    for (const table of TABLES) {
        try {
            console.log(`Exportando tabela: ${table}...`);
            const { data, error } = await supabase.from(table).select('*');

            if (error) {
                console.error(`  [ERRO] na tabela ${table}:`, error.message);
                continue;
            }

            const filePath = path.join(backupDir, `${table}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`  [OK] ${data.length} registros salvos em ${table}.json`);

        } catch (err) {
            console.error(`  [FALHA FATAL] na tabela ${table}:`, err.message);
        }
    }

    console.log(`\n✅ Backup concluído! Arquivos salvos em: ${backupDir}`);
}

backupAllData();
