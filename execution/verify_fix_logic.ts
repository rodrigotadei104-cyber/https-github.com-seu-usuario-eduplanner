
import { generateSchedule } from '../lib/scheduleEngine';

const input: any = {
    tenantId: 'test-tenant',
    numeroTurma: 'TURMA-50MIN',
    cursoId: 'curso-5s',
    cursoNome: '5S - Qualidade e Produtividade',
    dataInicio: '2027-01-01',
    diasSemanaSelecionados: [5], // Sexta-feira
    horariosDoDia: [
        { inicio: '13:00', fim: '16:20' } // 200 minutos de slot
    ],
    disciplinas: [
        { id: 'd1', nomeDisciplina: 'Prática', cargaHoras: 2 },
        { id: 'd2', nomeDisciplina: 'Introdução ao 5S', cargaHoras: 2 }
    ],
    diasBloqueados: new Set(),
    minutosPorHora: 50 // O novo parâmetro!
};

console.log('--- INICIANDO TESTE DE VALIDAÇÃO MATEMÁTICA (BASE 50MIN) ---');
console.log('Cenário: 4h de carga (base 50min) = 200 minutos totais.');
console.log('Disponibilidade: Slot de 13:00 às 16:20 = 200 minutos.');
console.log('-----------------------------------------------------------');

try {
    const result = generateSchedule(input);
    
    console.log(`\nResultados:`);
    console.log(`- Total de Aulas Geradas: ${result.aulas.length}`);
    console.log(`- Horas Totais (na base 50min): ${result.totalHorasGeradas}h`);
    
    const diasUnicos = new Set(result.aulas.map(a => a.data.toISOString().split('T')[0]));
    console.log(`- Total de Dias Utilizados: ${diasUnicos.size}`);

    result.aulas.forEach((aula, i) => {
        console.log(`  [Aula ${i+1}] ${aula.horarioInicio} - ${aula.horarioFim} | Carga: ${aula.cargaHorariaMateria}h`);
    });

    if (diasUnicos.size === 1 && result.totalHorasGeradas === 4) {
        console.log('\n✅ TESTE PASSOU: A carga de 4h coube em apenas 1 dia!');
    } else {
        console.log('\n❌ TESTE FALHOU: O cálculo ainda está incorreto.');
    }

} catch (err) {
    console.error('ERRO NO TESTE:', err);
}
