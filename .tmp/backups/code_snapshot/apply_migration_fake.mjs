import { createClient } from '@supabase/supabase-js';
const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';
const supabase = createClient(url, key);

async function run() {
    console.log('Tentando adicionar coluna numero_turma...');
    // Note: This usually fails if anon key doesn't have privileges, but we try anyway just in case the policy allows it 
    // or if we can use a "magic" workaround.
    // Ideally user should run the SQL in their dashboard.
    // But let's try calling a generic RPC if it exists or raw query.

    // Since we don't have a direct SQL runner, we assume the user might need to run this.
    // However, we can try to "soft" check if we can insert it differently? No.

    console.log('AVISO: Se este script falhar, você precisará rodar o SQL manualmente no Supabase.');
    console.log(`
    ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS numero_turma TEXT;
    CREATE INDEX IF NOT EXISTS idx_aulas_turma ON public.aulas(tenant_id, numero_turma);
  `);
}

run();
