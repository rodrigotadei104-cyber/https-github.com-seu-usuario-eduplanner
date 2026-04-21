
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function fixDuplicates() {
    console.log('Iniciando correção de duplicidades...');

    const { data: aulas, error } = await supabase.from('aulas').select('*');
    if (error) {
        console.error('Erro ao buscar aulas:', error);
        return;
    }

    const duplicatesMap = {};

    // Identificar duplicatas
    aulas.forEach(aula => {
        if (aula.instrutor_id) {
            const key = `${aula.data}_${aula.instrutor_id}_${aula.horario_inicio}`;
            if (!duplicatesMap[key]) duplicatesMap[key] = [];
            duplicatesMap[key].push(aula);
        }
    });

    const idsToDelete = [];

    Object.entries(duplicatesMap).forEach(([key, group]) => {
        if (group.length > 1) {
            console.log(`\nGrupo Duplicado: ${key} (${group.length} aulas)`);

            // Estratégia: Manter a aula criada primeiro (ou por ID)
            // Ordenar por created_at (se existir) ou ID
            group.sort((a, b) => (a.created_at || a.id) > (b.created_at || b.id) ? 1 : -1);

            // A primeira é a "original", as outras são duplicatas
            const original = group[0];
            const duplicates = group.slice(1);

            console.log(` -> Mantendo: ${original.id} (${original.created_at})`);
            duplicates.forEach(dup => {
                console.log(` -> Deletando: ${dup.id} (${dup.created_at})`);
                idsToDelete.push(dup.id);
            });
        }
    });

    if (idsToDelete.length > 0) {
        console.log(`\nDeletando ${idsToDelete.length} registros duplicados...`);
        const { error: deleteError } = await supabase
            .from('aulas')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            console.error('Erro ao deletar:', deleteError);
        } else {
            console.log('Sucesso! Duplicidades removidas.');
        }
    } else {
        console.log('Nenhuma duplicidade encontrada.');
    }
}

fixDuplicates();
