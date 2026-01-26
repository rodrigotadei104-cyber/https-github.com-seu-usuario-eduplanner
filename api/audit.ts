
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Node.js runtime with IAD1 region (consistent with generate-schedule)
export const config = {
    maxDuration: 10,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Models
const PRIMARY_MODEL = 'gemini-2.0-flash'; // Faster, stable
const FALLBACK_MODEL = 'gemini-1.5-flash';

// Auth Helper
async function validateUser(req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
}

async function tryGenerateWithModel(modelName: string, prompt: string, timeoutMs: number) {
    console.log(`[Audit] Attempting with model: ${modelName}`);

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${modelName} timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise
    ]);

    return result;
}

export default async function handler(req: any, res: any) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Security Check
        if (!req.headers.authorization) {
            return res.status(401).json({ error: 'Unauthorized: Missing token' });
        }
        const user = await validateUser(req);
        if (!user) {
            return res.status(403).json({ error: 'Forbidden: Invalid token' });
        }

        const { rows } = req.body;
        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'Invalid payload: rows array required' });
        }

        // Optimization: Limit rows to analyze to avoid huge prompts (Process first 50 rows max for audit)
        const rowsToAnalyze = rows.slice(0, 50).map((r: any) => ({
            id: r.originalLine,
            curso: r.numeroCurso || r.nomeCurso,
            materia: r.disciplina,
            data: r.data,
            inicio: r.horarioInicio,
            fim: r.horarioFim,
            instrutor: r.instrutor
        }));

        const prompt = `
            Você é um Auditor Especialista em Cronogramas Educacionais.
            Analise a lista de aulas abaixo (importadas de um Excel) e identifique erros de lógica, conflitos ou inconsistências.
            
            Regras de Auditoria:
            1. Horários: O fim deve ser após o início. A carga horária deve fazer sentido (não mais que 10h/dia).
            2. Conflitos: O mesmo instrutor não pode estar em dois lugares ao mesmo tempo.
            3. Datas: Verifique datas passadas muito antigas ou datas futuras improváveis.
            4. Duplicatas: Aulas idênticas no mesmo dia/horário.
            
            Retorne APENAS JSON válido, sem markdown:
            {
                "insights": [
                    { "rowId": number, "severity": "high" | "medium" | "low", "message": "Texto curto do erro" }
                ]
            }
            Se não houver erros, retorne { "insights": [] }.

            Dados:
            ${JSON.stringify(rowsToAnalyze)}
        `;

        let result: any = null;
        let usedModel = PRIMARY_MODEL;

        try {
            // Attempt 1
            result = await tryGenerateWithModel(PRIMARY_MODEL, prompt, 9000);
        } catch (error: any) {
            console.warn(`[Audit] Primary failed: ${error.message}. Retrying...`);
            try {
                // Attempt 2
                usedModel = FALLBACK_MODEL;
                result = await tryGenerateWithModel(FALLBACK_MODEL, prompt, 9000);
            } catch (fallbackError: any) {
                return res.status(503).json({
                    error: 'Audit service unavailable',
                    details: fallbackError.message
                });
            }
        }

        const responseText = result.response.text();
        const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(cleanText);
        } catch (e) {
            parsed = { insights: [], error: 'Failed to parse AI response' };
        }

        return res.status(200).json({ ...parsed, model_used: usedModel });

    } catch (error: any) {
        console.error('[Audit] Handler Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
