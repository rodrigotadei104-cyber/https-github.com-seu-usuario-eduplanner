
import { GoogleGenerativeAI } from '@google/generative-ai';

// Node.js runtime with IAD1 region (via vercel.json)
export const config = {
    maxDuration: 60, // Increased to 60s to allow full AI generation
};

// Models - Primary: Gemini 2.0 Flash (Stable), Fallback: Gemini 2.0 Flash Lite
const PRIMARY_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash-lite-001';

// Simple mock validation
async function validateUser(req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    return { id: 'restored_user', app_metadata: { tenant_id: 'default' } };
}

export default async function handler(req: any, res: any) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            message: 'Schedule Generator API is ready',
            hasKey: !!process.env.GEMINI_API_KEY,
            region: process.env.VERCEL_REGION || 'unknown'
        });
    }

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        console.log('[API] Request received. Key Present:', !!apiKey);

        if (!apiKey) {
            console.error('[API] GEMINI_API_KEY is missing in environment variables');
            return res.status(500).json({ error: 'Configuration Error: GEMINI_API_KEY is not defined in Vercel Settings.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const {
            courseName,
            subjects,
            startDate,
            timeSlots, // New Array [{start, end}, {start, end}]
            daysOfWeek,
            excludedDates,
            guidelines = ''
        } = req.body;

        if (!courseName || !subjects || !timeSlots || timeSlots.length === 0) {
            return res.status(400).json({ error: 'Missing required course parameters' });
        }

        // Calculate total hours required
        const totalHours = subjects.reduce((acc: number, s: any) => acc + Number(s.cargaHoraria || 0), 0);

        const timeSlotsText = timeSlots.map((ts: any, idx: number) => `Turno ${idx + 1}: ${ts.start} às ${ts.end}`).join(' e ');

        const validDays = daysOfWeek.map((d: number) => {
            const map: any = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 0: 'Dom' };
            return map[d];
        }).join(', ');

        const prompt = `

        Contexto
Você é o Agente Criador do sistema EduPlanner.
Seu papel não é “sugerir cronogramas”, mas planejar cronogramas coerentes, como faria um coordenador pedagógico experiente.

🎯 OBJETIVO
Criar cronogramas de aulas logicamente consistentes, respeitando carga horária, períodos disponíveis e distribuição proporcional, sem gerar excessos, sobras inválidas ou incoerências temporais.

🧠 MODO DE OPERAÇÃO(OBRIGATÓRIO)
Antes de gerar qualquer cronograma, você DEVE executar as seguintes etapas mentalmente:

ETAPA 1 — Cálculo
            - Calcule a carga horária total do curso
                - Calcule o total de dias disponíveis
                    - Calcule o tempo disponível por período somando os turnos: ${timeSlotsText}

ETAPA 2 — Distribuição Proporcional
            - Distribua a carga horária de forma proporcional e equilibrada
                - Exemplo: Curso 20h, 2 dias iguais -> Resultado obrigatório: 10h por dia

ETAPA 3 — Alocação por Disciplina
            - Aloque disciplinas respeitando: carga total da disciplina e limite de horas do período
                - Se uma disciplina não couber inteira:
        - Aloque o máximo possível
            - Transfira o restante para o próximo período disponível(PREENCHIMENTO TIPO TETRIS)

ETAPA 4 — Simulação
            - Simule cada dia como se estivesse acontecendo
                - Verifique se nenhum período ultrapassa o limite
                    - Verifique se a soma final fecha exatamente

ETAPA 5 — Validação Final(SQC - Score de Qualidade)
            - Calcule o SQC(0 - 100) do seu rascunho:
  A) Consistência Matemática(0 - 30): Soma exata de ${totalHours} h ? (Crítico)
  B) Distribuição(0 - 20): Dias equilibrados ?
            C) Pedagogia(0 - 20): Ordem lógica ?
                D) Eficiência(0 - 15): Sem buracos ?
                    E) Legibilidade(0 - 15): Fácil de ler ?

- ** REGRA DE OURO:** Se Score < 80 ou Soma != ${totalHours} h:
        - CORRIJA IMEDIATAMENTE.
  - Crie novos dias se necessário.
  - NUNCA entregue um cronograma com menos de ${totalHours} h.

🚫 PROIBIÇÕES
            - Não ultrapassar carga horária total
                - Não deixar horas “perdidas”
        - Não criar dias desbalanceados sem justificativa
            - Não fragmentar disciplinas sem necessidade lógica
                - JAMAIS agendar em dias não listados em: ${daysOfWeek.join(', ')} (${validDays})
        - JAMAIS agendar aos domingos se "0" não estiver na lista de dias permitidos.
- 🚫 CRÍTICO: NÃO TERMINE O CRONOGRAMA ANTES DE COMPLETAR EXATAMENTE ${totalHours} HORAS.Se acabar em 10:00 e deveria ir até 17:00, está errado.PREENCHA O TEMPO.

✅ CRITÉRIO DE QUALIDADE
Um cronograma só é aceitável se:
        - Fecha matematicamente(${totalHours}h exatas)
            - É executável na prática
                - Faz sentido para um ser humano
                    - Evita retrabalho e correções manuais

⚠️ INSTRUÇÃO FINAL
Você deve pensar como um planejador humano, não como um gerador de texto.

--- DADOS EXATOS-- -
            Curso: ${courseName}
Carga Horária TOTAL: ${totalHours} h(A soma das aulas DEVE ser igual a esta)
        Início: ${startDate}
        Turnos: ${timeSlotsText}
Dias Permitidos: ${daysOfWeek.join(', ')} (${validDays})
        Feriados: ${(excludedDates || []).join(', ')}

        MATÉRIAS:
${subjects.map((s: any) => `- [ID: ${s.id}] ${s.nome}: ${s.cargaHoraria}h`).join('\n')}

        DIRETRIZES:
${guidelines || 'Siga a ordem pedagógica e maximize o aprendizado.'}

        --- FORMATO DE SAÍDA(JSON PURE)-- -
            {
                "schedule": [
                    {
                        "date": "YYYY-MM-DD",
                        "startTime": "HH:MM",
                        "endTime": "HH:MM",
                        "subjectId": "ID",
                        "subjectName": "NOME"
                    }
                ]
            }
                `.trim();

        // === AGENTIC REPAIR LOOP CONFIG ===
        const MAX_RETRIES = 2; // Initial + 2 Retries = 3 Total Attempts
        let attempts = 0;
        let currentPrompt = prompt; // Start with the base prompt
        let lastScheduleData: any = null;
        let bestScheduleData: any = null;
        let minErrorCount = Infinity;
        let usedModel = PRIMARY_MODEL;

        // Validation Helper
        const validateSchedule = (schedule: any[], plannedSubjects: any[]) => {
            const errors: string[] = [];
            let totalErrorDiff = 0;

            plannedSubjects.forEach(subj => {
                const planned = Number(subj.cargaHoraria) || 0;

                // Calculate Used
                const used = schedule.reduce((acc: number, cls: any) => {
                    const isMatch = cls.subjectId === subj.id ||
                        (!cls.subjectId && cls.subjectName && cls.subjectName.toLowerCase().trim() === subj.nome.toLowerCase().trim());

                    if (isMatch) {
                        const [hStart, mStart] = cls.startTime.split(':').map(Number);
                        const [hEnd, mEnd] = cls.endTime.split(':').map(Number);
                        const duration = ((hEnd * 60 + mEnd) - (hStart * 60 + mStart)) / 60;
                        return acc + duration;
                    }
                    return acc;
                }, 0);

                const diff = used - planned;
                if (Math.abs(diff) > 0.1) { // Tolerate small floating point diffs
                    errors.push(`- Matéria '${subj.nome}': Planejado ${planned}h, Agendado ${used}h (${diff > 0 ? '+' : ''}${diff}h).`);
                    totalErrorDiff += Math.abs(diff);
                }
            });

            return { errors, totalErrorDiff };
        };


        // === MAIN LOOP ===
        while (attempts <= MAX_RETRIES) {
            attempts++;
            console.log(`[Generate] Attempt ${attempts}/${MAX_RETRIES + 1}`);

            // GENERATION WITH DUAL-MODEL FALLBACK
            const timeoutMs = attempts > 1 ? 60000 : 50000; // Give more time for repairs
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`AI Timeout after ${timeoutMs} ms`)), timeoutMs)
            );

            let result: any;

            try {
                // EXCLUSIVE: Using only Primary Model (Gemini 2.0) as requested
                console.log(`[Generate] Using Primary: ${PRIMARY_MODEL}`);
                const model = genAI.getGenerativeModel({
                    model: PRIMARY_MODEL,
                    generationConfig: { responseMimeType: "application/json" }
                });
                result = await Promise.race([model.generateContent(currentPrompt), timeoutPromise]);
            } catch (error: any) {
                console.error(`[Generate] Primary Failed: ${error.message}`);
                // If Primary fails, we throw immediately to see the REAL error (e.g. Quota Exceeded, Timeout, etc)
                // No fallback to avoid confusion.
                throw error;
            }

            try {
                const responseText = result.response.text();
                // Safe JSON parse
                const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const json = JSON.parse(cleanedText);
                const schedule = json.schedule || json;

                if (!Array.isArray(schedule)) {
                    throw new Error("Formato de resposta inválido (não é array).");
                }

                lastScheduleData = schedule;

                // VALIDATE
                const { errors, totalErrorDiff } = validateSchedule(schedule, subjects);

                if (errors.length === 0) {
                    console.log(`[Generate] Success! No errors found on attempt ${attempts}.`);
                    return res.status(200).json({
                        schedule: schedule,
                        model_used: usedModel,
                        attempts: attempts,
                        repaired: attempts > 1
                    });
                }

                // If we are here, we have errors.
                console.warn(`[Generate] Validation Errors on attempt ${attempts}:`, errors);

                // Keep track of the "least bad" schedule
                if (totalErrorDiff < minErrorCount) {
                    minErrorCount = totalErrorDiff;
                    bestScheduleData = schedule;
                }

                // PREPARE REPAIR PROMPT FOR NEXT ROUND
                if (attempts <= MAX_RETRIES) {
                    currentPrompt = `
LEITURA CRÍTICA DO SEU RASCUNHO ANTERIOR:
Você gerou um cronograma, mas meu validador matemático encontrou os seguintes ERROS GRAVES:

${errors.join('\n')}

IMPORTANTE:
1. Você DEVE corrigir esses erros. Adicione ou remova horas para atingir EXATAMENTE o planejado.
2. MANTENHA o restante que estava correto.
3. Não peça desculpas. Apenas gere o JSON CORRIGIDO.
4. O total de horas DEVE bater.

Responda APENAS com o JSON corrigido.
                    `.trim();
                }

            } catch (parseErr) {
                console.error(`[Generate] Parse/Validation Error on attempt ${attempts}:`, parseErr);
                // If it's a parsing error, we can try saying "Invalid JSON" to the AI, but for now let's just retry default behavior
            }
        } // End While

        // If we exhausted retries, return the best we have (or last)
        console.warn(`[Generate] Exhausted retries. Returning best effort.`);
        return res.status(200).json({
            schedule: bestScheduleData || lastScheduleData,
            model_used: usedModel,
            attempts: attempts,
            warning: 'Correção automática incompleta. Verifique auditoria.'
        });

    } catch (err: any) {
        console.error('[API Error]:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: err.message || String(err)
        });
    }
}
