
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function fixStatus() {
    console.log('Iniciando correção de status (Concluída -> Agendada)...');

    // Buscar aulas concluídas incompletas
    const { data: aulas, error } = await supabase
        .from('aulas')
        .select('id, data, instrutor_id, materia_id, status')
        .eq('status', 'concluida');

    if (error) {
        console.error('Erro ao buscar aulas:', error);
        return;
    }

    const idsToUpdate = [];
    aulas.forEach(aula => {
        if (!aula.instrutor_id || !aula.materia_id) {
            console.log(` -> Revertendo: ${aula.id} (${aula.data})`);
            idsToUpdate.push(aula.id);
        }
    });

    if (idsToUpdate.length > 0) {
        console.log(`\nAtualizando ${idsToUpdate.length} registros...`);
        const { error: updateError } = await supabase
            .from('aulas')
            .update({ status: 'agendada' })
            .in('id', idsToUpdate);

        if (updateError) {
            console.error('Erro ao atualizar:', updateError);
        } else {
            console.log('Sucesso! Status revertidos para "agendada".');
        }
    } else {
        console.log('Nenhum status inválido encontrado.');
    }
}

fixStatus();
