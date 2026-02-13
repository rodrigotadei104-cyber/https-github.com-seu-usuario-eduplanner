
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function applyConstraints() {
    console.log('Aplicando constraints de integridade...');

    const sql = `
    -- 1. Constraint: Cannot be 'concluida' if instructor or materia is missing
    DO $$ BEGIN
        ALTER TABLE public.aulas
        ADD CONSTRAINT check_aula_concluida_completa
        CHECK (
            status != 'concluida' 
            OR (instrutor_id IS NOT NULL AND materia_id IS NOT NULL)
        );
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    -- 2. Unique Index to prevent overlap
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_instrutor_horario
    ON public.aulas (instrutor_id, data, horario_inicio)
    WHERE instrutor_id IS NOT NULL;
    `;

    // Try to run via RPC if available, otherwise just log instruction
    // Since we don't have a direct SQL runner in the client usually without a specific function.
    // However, I will try to use the 'rpc' method if a 'exec_sql' function exists (common in some setups)
    // Or just tell the user to run it. 

    // BUT, wait! I can't run DDL via client unless there is an exposed function.
    // I will check if I can use the 'postgres' library if available? No, only supabase-js.

    // SO, I will create the file and tell the user to run it in the SQL Editor.
    console.log('⚠️  ATENÇÃO: Não é possível executar DDL (ALTER TABLE) via cliente JS diretamente sem uma função RPC configurada.');
    console.log('Por favor, copie o conteúdo de "supabase/migrations/011_add_integrity_constraints.sql" e execute no SQL Editor do Supabase.');
    console.log('\nConteúdo do arquivo:');
    console.log(sql);
}

applyConstraints();
