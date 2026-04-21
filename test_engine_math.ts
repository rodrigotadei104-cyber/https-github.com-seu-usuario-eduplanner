import { generateSchedule, ScheduleEngineInput } from './lib/scheduleEngine.js';

// Mock data based on types
const input: ScheduleEngineInput = {
    tenantId: 'tenant-123',
    numeroTurma: 'turma-456',
    cursoId: 'curso-789',
    cursoNome: 'Intensivo de Programação',
    instrutorId: 'instrutor-789',
    instrutorNome: 'Prof. Girafales',
    dataInicio: '2026-04-01', // Vai começar numa Quarta-feira
    diasSemanaSelecionados: [1, 3], // 1=Segunda, 3=Quarta
    horariosDoDia: [
        { inicio: '08:00', fim: '12:00' }, // Slot 1: 4 horas
        { inicio: '13:00', fim: '15:00' }  // Slot 2: 2 horas
    ],
    disciplinas: [
        {
            id: 'disc-1', tenantId: 'tenant-123', cursoId: 'curso-789',
            nomeDisciplina: 'Lógica', cargaHoras: 10, tipoDisciplina: 'teorica'
        },
        {
            id: 'disc-2', tenantId: 'tenant-123', cursoId: 'curso-789',
            nomeDisciplina: 'Banco de Dados', cargaHoras: 5, tipoDisciplina: 'pratica'
        }
    ],
    diasBloqueados: new Set(['2026-04-06']) // Feriado na segunda-feira seguinte
};

try {
    console.log('--- SIMULAÇÃO DE MOTOR ACADÊMICO (EDUPLANNER) ---');
    console.log(`Carga Total: 15h. Inicio: 01/04(Qua). Dias: Seg/Qua. Slots: 4h e 2h.`);
    console.log(`Feriado bloqueado: 06/04 (Segunda)`);
    console.log('--------------------------------------------------');

    const result = generateSchedule(input);

    console.log(`\n✅ Sucesso! Total Horas: ${result.totalHorasGeradas}h. Iterações no Calendário: ${result.totalDiasUtilizados}`);

    result.aulas.forEach((aula, index) => {
        const diaSemana = aula.data.getDay();
        let diaStr = diaSemana === 1 ? 'Segunda' : diaSemana === 3 ? 'Quarta' : 'Outro';
        const dataStr = aula.data.toISOString().split('T')[0];
        console.log(`[Aula ${String(index + 1).padStart(2, '0')}] ${dataStr} (${diaStr}) | ${aula.horarioInicio} - ${aula.horarioFim} | ${aula.materia.padEnd(15)} | ${aula.cargaHorariaMateria}h`);
    });

} catch (err) {
    console.error('\n❌ ERRO NA GERAÇÃO:', err.message);
}
