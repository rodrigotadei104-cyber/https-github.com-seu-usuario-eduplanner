import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function checkRLSData() {
    console.log('=== VERIFICAÇÃO DE DADOS SEM AUTH (RLS ATIVO?) ===');
    const { data: aulasDirect, error: errD } = await supabase.from('aulas').select('id, data, status, curso_id, numero_turma');
    console.log('Direct Select Aulas:', errD ? errD.message : `Encontradas ${aulasDirect.length} aulas.`);

    console.log('\n=== REALIZANDO AUTH COMO USER ATIVO ===');
    // Para ver os dados, precisamos de um login de tenant válido!
    // Vamos buscar os dados dos usuários na tabela 'users' usando a chave ou ver no auth.users
    const { data: users, error: errU } = await supabase.from('users').select('*');
    if (errU) {
        console.error('Erro ao listar usuários:', errU);
    } else {
        console.log(`Encontrados ${users.length} usuários:`);
        users.forEach(u => {
            console.log(`  - [ID: ${u.id}] Nome: "${u.name}" | Email: "${u.email}" | Tenant: "${u.tenant_id}"`);
        });
    }
}

checkRLSData();
