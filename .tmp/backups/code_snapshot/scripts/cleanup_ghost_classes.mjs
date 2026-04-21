
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function cleanup() {
    console.log('Iniciando limpeza de aulas fantasmas em 2026-02-07...');
    const targetDate = '2026-02-07';

    // Select * to see all columns and filter in JS
    const { data, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('data', targetDate);

    if (error) {
        console.error('Erro ao buscar:', error);
        return;
    }

    // Filtrar aulas onde instrutor_id E materia_id são nulos/vazios
    // Ajuste: verificar instrutor_id e materia_id, pois as colunas 'instrutor' e 'materia' não existem na tabela
    const ghostClasses = data.filter(a =>
        (!a.instrutor_id || a.instrutor_id === '') &&
        (!a.materia_id || a.materia_id === '')
    );

    console.log(`Encontradas ${ghostClasses.length} aulas fantasmas para deletar.`);

    if (ghostClasses.length > 0) {
        console.log('IDs encontrados:');
        ghostClasses.forEach(a => {
            console.log(` - ${a.id}`);
        });
    } else {
        console.log('Nenhuma aula para deletar.');
        return;
    }

    const idsToDelete = ghostClasses.map(a => a.id);

    const { error: deleteError } = await supabase
        .from('aulas')
        .delete()
        .in('id', idsToDelete);

    if (deleteError) {
        console.error('Erro ao deletar:', deleteError);
    } else {
        console.log(`\nSucesso! ${idsToDelete.length} registros deletados.`);
    }
}

cleanup();
