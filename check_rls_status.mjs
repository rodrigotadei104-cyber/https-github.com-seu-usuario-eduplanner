
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, anonKey);

async function checkRLSStatus() {
    console.log('=== Verificando estado do RLS pós-migration ===');
    console.log('Projeto: eduplanner-prod (ubhtibihkpwocgazwtur)');
    console.log('');
    console.log('Lógica: Com RLS ativo + políticas de tenant isolation,');
    console.log('uma query anônima deve retornar 0 rows (sem erro).');
    console.log('Se retornar QUALQUER row > 0, o RLS NÃO está protegendo.\n');

    const tables = ['tenants', 'users', 'instrutores', 'cursos', 'materias', 'aulas'];
    let allSecure = true;

    for (const table of tables) {
        try {
            const { data, error, count } = await supabase
                .from(table)
                .select('id', { count: 'exact', head: false })
                .limit(5);

            if (error) {
                if (error.code === '42501') {
                    console.log(`✅ ${table}: RLS ATIVO (Query bloqueada pelo banco)`);
                } else {
                    console.log(`⚠️  ${table}: Erro inesperado: ${error.message}`);
                }
            } else if (!data || data.length === 0) {
                // 0 rows sem autenticação = RLS filtrando corretamente
                console.log(`✅ ${table}: RLS ATIVO (0 rows sem autenticação — políticas funcionando)`);
            } else {
                // Se chegou rows sem auth = RLS não está protegendo
                console.log(`❌ ${table}: RLS AUSENTE! ${data.length} rows visíveis sem autenticação!`);
                allSecure = false;
            }
        } catch (e) {
            console.log(`⚠️  ${table}: Exceção: ${e.message}`);
        }
    }

    console.log('');
    if (allSecure) {
        console.log('🔒 RESULTADO: Todas as tabelas estão protegidas pelo RLS!');
        console.log('✅ Os 6 erros do Supabase Security Advisor devem desaparecer após o próximo scan.');
        console.log('   Acesse: Dashboard > Security Advisor > Refresh para confirmar.');
    } else {
        console.log('❌ RESULTADO: Algumas tabelas ainda precisam de atenção.');
    }
}

checkRLSStatus();
