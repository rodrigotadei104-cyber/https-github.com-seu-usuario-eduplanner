
import { GoogleGenerativeAI } from '@google/generative-ai';

// Node.js runtime with IAD1 region
export const config = {
    maxDuration: 10,
};

const MODEL_NAME = 'gemini-1.5-flash';

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

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const { rows } = req.body;

        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'Invalid payload: rows array required' });
        }

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
            Analise a lista de aulas abaixo:
            ${JSON.stringify(rowsToAnalyze)}
            
            Retorne APENAS JSON:
            {
                "insights": [
                    { "rowId": number, "severity": "high" | "medium" | "low", "message": "Texto" }
                ]
            }
        `.trim();

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: { responseMimeType: "application/json" }
        });

        const result: any = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsed = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

        return res.status(200).json({
            ...parsed,
            model_used: MODEL_NAME
        });

    } catch (error: any) {
        console.error('[Audit Error]:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.message || String(error)
        });
    }
}
