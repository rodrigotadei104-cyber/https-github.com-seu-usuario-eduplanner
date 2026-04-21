import { DisciplinaCurso, Aula, HorarioSlot, ClassStatus } from '../types';
import { isBefore, addDays, getDay, parseISO, format, differenceInMilliseconds } from 'date-fns';

export interface ScheduleEngineInput {
    tenantId: string;
    numeroTurma: string;
    cursoId: string;
    cursoNome: string;
    instrutorId?: string;
    instrutorNome?: string;
    salaPadrao?: string;
    dataInicio: string;
    diasSemanaSelecionados: number[];
    horariosDoDia: HorarioSlot[];
    disciplinas: DisciplinaCurso[];
    diasBloqueados: Set<string>;
    datasBloqueadasTurma?: Set<string>;
}

export interface EngineResult {
    aulas: Omit<Aula, 'id'>[];
    totalHorasGeradas: number;
    totalDiasUtilizados: number;
    diasPuladosFeriado: Array<{ data: string; motivo: string }>;
}

const MAX_ITERATIONS = 10000; // Edge Case 1 (Proteção contra Loop Infinito) — suporta cursos de 1500h+

export function generateSchedule(input: ScheduleEngineInput): EngineResult {
    const {
        tenantId, numeroTurma, cursoId, cursoNome, instrutorId, instrutorNome, salaPadrao,
        dataInicio, diasSemanaSelecionados, horariosDoDia, disciplinas, diasBloqueados,
        datasBloqueadasTurma = new Set()
    } = input;

    if (diasSemanaSelecionados.length === 0) throw new Error('Nenhum dia da semana foi selecionado.');
    if (horariosDoDia.length === 0) throw new Error('Nenhum horário padrão definido (slot).');
    if (disciplinas.length === 0) throw new Error('O curso não possui disciplinas cadastradas.');

    const aulasGeradas: Omit<Aula, 'id'>[] = [];
    const diasPuladosFeriado: Array<{ data: string; motivo: string }> = [];
    const _feriadosPulados = new Set<string>(); // evitar duplicatas no log

    // Estado Global do Tempo (Cursor)
    let currentDate = parseISO(dataInicio);
    let currentSlotIndex = 0;

    // Rastreador de consumo INTRA-SLOT (Para permitir que múltiplas disciplinas pequenas dividam um slot de 4h, por ex.)
    let usedMillisecondsInCurrentSlot = 0;

    let iterationCounter = 0;
    let totalHorasGeradas = 0;

    // Função auxiliar para avançar o Cursor de Tempo para o próximo slot VÁLIDO
    const advanceCursorToNextValidSlot = () => {
        // Zera o rastreador de consumo intra-slot sempre que pulamos de slot real
        usedMillisecondsInCurrentSlot = 0;

        // Se o slot index extrapolou os slots de hoje, reseta pro inicio e avança 1 dia
        if (currentSlotIndex >= horariosDoDia.length) {
            currentSlotIndex = 0;
            currentDate = addDays(currentDate, 1);
        }

        let isValidDay = false;
        while (!isValidDay) {
            iterationCounter++;
            if (iterationCounter > MAX_ITERATIONS) {
                throw new Error('LIMITE_ITERACAO_ATINGIDO: Nenhuma data válida encontrada (Possível bloqueio de calendário infinito).');
            }

            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const dayOfWeek = getDay(currentDate);

            if (diasSemanaSelecionados.includes(dayOfWeek) && !diasBloqueados.has(dateStr) && !datasBloqueadasTurma.has(dateStr)) {
                isValidDay = true;
            } else {
                // Registrar se foi pulado por feriado ou bloqueio de turma
                if ((diasBloqueados.has(dateStr) || datasBloqueadasTurma.has(dateStr)) && !_feriadosPulados.has(dateStr)) {
                    _feriadosPulados.add(dateStr);
                    const motivo = datasBloqueadasTurma.has(dateStr) ? 'Bloqueio da Turma' : 'Feriado / Bloqueio';
                    diasPuladosFeriado.push({ data: dateStr, motivo });
                }
                currentDate = addDays(currentDate, 1);
                currentSlotIndex = 0;
            }
        }
    };

    for (const disciplina of disciplinas) {
        let cargaRestanteMilisegundos = disciplina.cargaHoras * 60 * 60 * 1000;

        while (cargaRestanteMilisegundos > 0) {
            // Se o cursor estiver limpo ou o slot atual já foi 100% consumido, avança.
            // Precisamos avaliar a capacidade total vs usada antes de avançar.
            if (currentSlotIndex < horariosDoDia.length) {
                const checkSlot = horariosDoDia[currentSlotIndex];
                const ds = format(currentDate, 'yyyy-MM-dd');
                const sStart = new Date(`${ds}T${checkSlot.inicio}:00`);
                const sEnd = new Date(`${ds}T${checkSlot.fim}:00`);
                const totalCap = differenceInMilliseconds(sEnd, sStart);

                if (usedMillisecondsInCurrentSlot >= totalCap) {
                    currentSlotIndex++;
                    advanceCursorToNextValidSlot();
                } else if (usedMillisecondsInCurrentSlot === 0) {
                    // Primeiro uso do cursor neste dia/slot. Garante que o dia é válido.
                    // Testa se o dia é válido (pode ser o inicio da geração)
                    const dateStr = format(currentDate, 'yyyy-MM-dd');
                    const dayOfWeek = getDay(currentDate);
                    if (!diasSemanaSelecionados.includes(dayOfWeek) || diasBloqueados.has(dateStr) || datasBloqueadasTurma.has(dateStr)) {
                        advanceCursorToNextValidSlot();
                    }
                }
            } else {
                advanceCursorToNextValidSlot();
            }

            const slot = horariosDoDia[currentSlotIndex];
            const dateStr = format(currentDate, 'yyyy-MM-dd');

            const slotStartStr = `${dateStr}T${slot.inicio}:00`;
            const slotEndStr = `${dateStr}T${slot.fim}:00`;
            const slotStart = new Date(slotStartStr);
            const slotEnd = new Date(slotEndStr);

            const capacidadeSlotMiliseg = differenceInMilliseconds(slotEnd, slotStart);
            if (capacidadeSlotMiliseg <= 0) throw new Error(`Horário de aula inválido detectado.`);

            const capacidadeRestanteNoSlot = capacidadeSlotMiliseg - usedMillisecondsInCurrentSlot;

            // Edge Case 3: O Slot Packing (Evitar fragmentação severa de dias)
            // A aula inicia considerando os milisegundos já consumidos no slot por matérias anteriores
            const aulaStartRealDate = new Date(slotStart.getTime() + usedMillisecondsInCurrentSlot);
            const classStartStr = format(aulaStartRealDate, 'HH:mm');

            const milisegundosAUsar = Math.min(capacidadeRestanteNoSlot, cargaRestanteMilisegundos);

            const finalRealDate = new Date(aulaStartRealDate.getTime() + milisegundosAUsar);
            const classEndStr = format(finalRealDate, 'HH:mm');

            const aula: any = {
                tenantId, numeroTurma, cursoId, curso: cursoNome,
                disciplinaId: disciplina.id, materia: disciplina.nomeDisciplina,
                data: new Date(currentDate),
                horarioInicio: classStartStr,
                horarioFim: classEndStr,
                instrutor: instrutorId || '',
                instrutorNome: instrutorNome || '',
                sala: salaPadrao || '',
                status: 'agendada' as ClassStatus,
                autoGerada: true,
                cargaHorariaMateria: +(milisegundosAUsar / (1000 * 60 * 60)).toFixed(2)
            };

            aulasGeradas.push(aula);

            cargaRestanteMilisegundos -= milisegundosAUsar;
            totalHorasGeradas += (milisegundosAUsar / (1000 * 60 * 60));
            usedMillisecondsInCurrentSlot += milisegundosAUsar;

            // Se o slot esgotou (uma matéria grande consumiu tudo, ou várias pequenas preencheram), preparamos o incremento
            if (usedMillisecondsInCurrentSlot >= capacidadeSlotMiliseg) {
                currentSlotIndex++;
                usedMillisecondsInCurrentSlot = 0;
            }
        }
    }

    // Validação Matemática Final
    const cargaOriginalCursoTotal = disciplinas.reduce((acc, obj) => acc + obj.cargaHoras, 0);
    if (totalHorasGeradas.toFixed(2) !== cargaOriginalCursoTotal.toFixed(2)) {
        throw new Error(`CRITICAL_MATH_ERROR: Inconsistência na geração de horas. Esperado: ${cargaOriginalCursoTotal}h. Gerado: ${totalHorasGeradas}h.`);
    }

    return { aulas: aulasGeradas, totalHorasGeradas, totalDiasUtilizados: iterationCounter, diasPuladosFeriado };
}
