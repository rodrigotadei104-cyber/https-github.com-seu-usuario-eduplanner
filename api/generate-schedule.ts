
import { GoogleGenerativeAI } from '@google/generative-ai';

// Node.js runtime with IAD1 region (via vercel.json)
export const config = {
    maxDuration: 10, // Max for hobby plan
};

// Models - RESTORED TO USER'S PREFERRED (2.0) + STABLE FALLBACK
const PRIMARY_MODEL = 'gemini-2.0-flash-exp';
const FALLBACK_MODEL = 'gemini-1.5-flash-latest';

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

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not defined' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const {
            courseName,
            subjects,
            startDate,
            timeSlot,
            daysOfWeek,
            excludedDates,
            breakDuration = 60,
            guidelines = ''
        } = req.body;

        if (!courseName || !subjects || !timeSlot) {
            return res.status(400).json({ error: 'Missing required course parameters' });
        }

        const prompt = `
Você é um gerador de cronogramas escolares. TAREFA: Criar cronograma de aulas.

DADOS DO CURSO:
Nome: ${courseName}
Período: ${startDate} até completar a carga horária.
Horário: ${timeSlot.start} às ${timeSlot.end}
Dias da semana: ${daysOfWeek.join(', ')} (1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb, 0=Dom)
Datas excluídas (feriados): ${(excludedDates || []).join(', ')}
Intervalo de Almoço/Descanso: ${breakDuration} minutos (não agende aulas neste período).

MATÉRIAS E CARGAS HORÁRIAS:
${subjects.map((s: any) => `- ${s.nome}: ${s.cargaHoraria} horas`).join('\n')}

DIRETRIZES DO USUÁRIO:
${guidelines || 'Siga a ordem pedagógica padrão.'}

REGRAS:
1. Distribua TODA a carga horária.
2. Cada aula deve ter duração compatível com o horário.
3. Respeite o intervalo de ${breakDuration} minutos.
4. RETORNE APENAS JSON VÁLIDO.

FORMATO JSON:
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

        // GENERATION WITH DUAL-MODEL FALLBACK
        const timeoutMs = 50000;
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`AI Timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        let result: any;
        let usedModel = PRIMARY_MODEL;

        try {
            console.log(`[Generate] Trying Primary: ${PRIMARY_MODEL}`);
            const model = genAI.getGenerativeModel({
                model: PRIMARY_MODEL,
                generationConfig: { responseMimeType: "application/json" }
            });
            result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
        } catch (error: any) {
            console.warn(`[Generate] Primary Failed: ${error.message}. Trying Fallback.`);
            try {
                usedModel = FALLBACK_MODEL;
                const model = genAI.getGenerativeModel({
                    model: FALLBACK_MODEL,
                    generationConfig: { responseMimeType: "application/json" }
                });
                result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
            } catch (fallbackError: any) {
                console.error(`[Generate] All models failed.`);
                return res.status(500).json({
                    error: 'AI Generation Failed',
                    details: fallbackError.message,
                    models_tried: [PRIMARY_MODEL, FALLBACK_MODEL]
                });
            }
        }

        const responseText = result.response.text();
        const scheduleData = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

        return res.status(200).json({
            schedule: scheduleData.schedule || scheduleData,
            model_used: usedModel
        });

    } catch (err: any) {
        console.error('[API Error]:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: err.message || String(err)
        });
    }
}
