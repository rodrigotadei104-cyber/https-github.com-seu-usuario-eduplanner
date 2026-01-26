
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Node.js runtime with IAD1 region (via vercel.json)
export const config = {
    maxDuration: 10, // Max for hobby plan
};

// Initialize client ONCE (outside handler for reuse across invocations)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Models - STABLE CONFIGURATION
// Using 1.5-flash as primary (Best balance of Speed/Cost/Stability)
const PRIMARY_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-pro'; // Higher reliability fallbackte session
async function validateUser(req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    // Use environment variables for URL and SERVICE ROLE KEY (preferred for backend) 
    // OR Anon key if we just verify JWT. 
    // Best practice for verifying user token: useanon key + getUser(token)
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing on server');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate the token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
}

async function tryGenerateWithModel(modelName: string, prompt: string, timeoutMs: number) {
    console.log(`Attempting generation with model: ${modelName}`);

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${modelName} timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    // Race between generation and timeout
    const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise
    ]);

    return result;
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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Security Check (OPTIONAL for now to unblock user)
        const authHeader = req.headers.authorization;
        let user = null;
        let tenantId = 'unknown'; // Default tenantId

        if (authHeader) {
            try {
                user = await validateUser(req);
                if (user) {
                    tenantId = user.app_metadata?.tenant_id || 'unknown';
                } else {
                    console.warn('[Generate] Invalid or expired token. Proceeding anonymously.');
                }
            } catch (e) {
                console.warn('[Generate] Token validation error (ignoring):', e);
            }
        } else {
            console.warn('[Generate] Missing Authorization header. Proceeding anonymously.');
        }

        // The original blocking checks for missing/invalid token are now removed.
        // The request will proceed even if `user` is null, but `tenantId` will be 'unknown'.
        // This makes the token verification non-blocking as per the instruction.
        // --------------------------------

        const {
            courseName,
            subjects,
            startDate,
            timeSlot,
            daysOfWeek,
            excludedDates,
            breakDuration = 60, // Default 60 mins
            guidelines = ''     // Optional guidelines
        } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'API Key missing in environment' });
        }

        // Prompt otimizado para garantir geração (MANTIDO INTACTO)
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

DIRETRIZES DO USUÁRIO (Rígidas):
${guidelines || 'Nenhuma diretriz específica. Siga a ordem pedagógica padrão.'}

REGRAS:
1. Distribua TODA a carga horária das matérias.
2. Cada aula deve ter duração compatível com o horário (${timeSlot.start}-${timeSlot.end}).
3. Respeite o intervalo de ${breakDuration} minutos (subtraia do tempo útil ou divida os turnos).
4. Siga as DIRETRIZES DO USUÁRIO acima.
5. RETORNE APENAS JSON VÁLIDO. Sem markdown.

FORMATO JSON ESPERADO:
{
  "schedule": [
    {
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "subjectId": "ID_DA_MATERIA_SE_HOUVER_OU_NOME",
      "subjectName": "Nome da Matéria"
    }
  ]
}
        `.trim();

        console.log(`Starting generation for user ${user.id} (Tenant: ${tenantId})`);

        let result: any = null;
        let usedModel = PRIMARY_MODEL;

        // --- FALLBACK STRATEGY (HOTFIX) ---
        try {
            // Attempt 1: Primary Model (2.0 Flash)
            result = await tryGenerateWithModel(PRIMARY_MODEL, prompt, 9000);
            console.log(`Success with PRIMARY model: ${PRIMARY_MODEL}`);
        } catch (primaryError: any) {
            console.warn(`Primary model ${PRIMARY_MODEL} failed: ${primaryError.message}. Switching to fallback...`);

            try {
                // Attempt 2: Fallback Model (1.5 Flash 8b)
                usedModel = FALLBACK_MODEL;
                result = await tryGenerateWithModel(FALLBACK_MODEL, prompt, 9000);
                console.log(`Success with FALLBACK model: ${FALLBACK_MODEL}`);
            } catch (fallbackError: any) {
                // Both failed
                console.error(`All models failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
                return res.status(503).json({
                    error: 'AI generation failed on all models',
                    details: fallbackError.message || 'Timeout/Unavailable',
                    models_tried: [PRIMARY_MODEL, FALLBACK_MODEL]
                });
            }
        }
        // ----------------------------------

        // Extract and parse response
        const responseText = result.response.text();

        // Try to parse JSON (Gemini sometimes wraps in markdown)
        let scheduleData;
        try {
            // Remove markdown code blocks if present
            const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            scheduleData = JSON.parse(cleanText);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr);
            return res.status(500).json({
                error: 'Invalid JSON from AI',
                details: responseText.substring(0, 500),
                model_used: usedModel
            });
        }

        // Return immediately
        return res.status(200).json(scheduleData);

    } catch (error: any) {
        console.error('Handler Error:', error);
        return res.status(500).json({
            error: error.message || 'Unknown error',
            details: String(error)
        });
    }
}
