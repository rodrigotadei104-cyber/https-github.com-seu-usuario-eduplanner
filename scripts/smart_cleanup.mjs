
import { createClient } from '@supabase/supabase-js';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function smartCleanup() {
    console.log('Iniciando análise inteligente de duplicatas em 2026-02-07...');
    const targetDate = '2026-02-07';

    const { data: aulas, error } = await supabase
        .from('aulas')
        .select('*')
        .eq('data', targetDate);

    if (error) {
        console.error('Erro ao buscar:', error);
        return;
    }

    console.log(`Total de aulas encontradas: ${aulas.length}`);

    // Agrupar por Matéria + Horário Inicio
    const groups = {};
    aulas.forEach(aula => {
        const key = `${aula.materia_id}_${aula.horario_inicio}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(aula);
    });

    const idsToDelete = [];

    Object.keys(groups).forEach(key => {
        const group = groups[key];
        if (group.length > 1) {
            console.log(`\nGrupo Duplicado encontrado (${key}): ${group.length} registros`);

            // Priorizar aulas com instrutor
            const withInstructor = group.filter(a => a.instrutor_id);
            const withoutInstructor = group.filter(a => !a.instrutor_id);

            if (withInstructor.length > 0) {
                // Se temos aulas COM instrutor, deletamos as SEM instrutor
                withoutInstructor.forEach(a => {
                    console.log(` -> Marcando para deletar (SEM instrutor): ${a.id}`);
                    idsToDelete.push(a.id);
                });

                // Se houver múltiplas COM instrutor, manter a primeira e deletar excesso?
                // Isso é arriscado sem confirmar se são instrutores diferentes.
                // Verificando instrutores diferentes:
                const uniqueInstructors = new Set(withInstructor.map(a => a.instrutor_id));
                if (uniqueInstructors.size > 1) {
                    console.warn(` -> AVISO: Instrutores DIFERENTES no mesmo horário. NÃO deletando duplicatas com instrutor.`);
                    // Nesse caso, pode ser conflito real, não deletamos automaticamente.
                } else if (withInstructor.length > 1) {
                    // Mesmo instrutor duplicado.
                    // Deletar os extras (mamter o primeiro)
                    for (let i = 1; i < withInstructor.length; i++) {
                        console.log(` -> Marcando para deletar (Duplicata mesmo instrutor): ${withInstructor[i].id}`);
                        idsToDelete.push(withInstructor[i].id);
                    }
                }

            } else {
                // Se NENHUM tem instrutor, manter 1, deletar outros
                for (let i = 1; i < group.length; i++) {
                    console.log(` -> Marcando para deletar (Duplicata sem instrutor): ${group[i].id}`);
                    idsToDelete.push(group[i].id);
                }
            }
        }
    });

    console.log(`\nTotal de registros para deletar: ${idsToDelete.length}`);

    if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
            .from('aulas')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            console.error('Erro ao deletar:', deleteError);
        } else {
            console.log('Limpeza realizada com sucesso!');
        }
    } else {
        console.log('Nenhuma duplicata segura para deletar.');
    }
}

smartCleanup();
