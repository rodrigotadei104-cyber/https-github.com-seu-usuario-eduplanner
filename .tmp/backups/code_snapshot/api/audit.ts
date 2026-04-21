
import { GoogleGenerativeAI } from '@google/generative-ai';

// Node.js runtime with increased timeout
export const config = {
    maxDuration: 30, // Increased to 30s to allow for a more thorough analysis
};

const MODEL_NAME = 'gemini-2.0-flash'; // Using the latest, faster model

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
            return res.status(500).json({ error: 'Configuração da API Key (GEMINI_API_KEY) ausente no servidor.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const { rows } = req.body;

        console.log(`[Audit Request] Rows count: ${rows?.length || 0}`);

        if (!rows || !Array.isArray(rows)) {
            console.error('[Audit Error] Invalid payload: rows is not an array');
            return res.status(400).json({ error: 'Payload inválido: array de linhas obrigatório.' });
        }

        // Limit to 50 rows for performance and cost
        const rowsToAnalyze = rows.slice(0, 50).map((r: any) => ({
            id: r.originalLine || r.id || 0,
            curso: r.numeroCurso || r.nomeCurso,
            materia: r.disciplina,
            data: r.data,
            inicio: r.horarioInicio,
            fim: r.horarioFim,
            instrutor: r.instrutor
        }));

        const prompt = `
            Você é um Auditor Especialista em Cronogramas Educacionais.
            Analise a lista de aulas abaixo e identifique conflitos de sala, erros de data, 
            sobreposição de horários de instrutores ou inconsistências pedagógicas.
            
            Lista de Aulas:
            ${JSON.stringify(rowsToAnalyze)}
            
            Regra: Retorne APENAS um objeto JSON no formato abaixo, sem explicações extras.
            Formato:
            {
                "insights": [
                    { "rowId": number, "severity": "high" | "medium" | "low", "message": "Descrição curta do problema ou elogio" }
                ]
            }
        `.trim();

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1 // Lower temperature for more consistent auditing
            }
        });

        // Set a local timeout for the fetch call to Gemini itself
        const result: any = await model.generateContent(prompt).catch((e: any) => {
            console.error('[Gemini Call Error]:', e);
            throw new Error(`Falha na comunicação com Google AI: ${e.message}`);
        });

        const responseText = result.response.text();
        console.log(`[Audit Response] Raw Text: ${responseText}`);

        let parsed;
        try {
            parsed = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
            console.log(`[Audit Success] Insights count: ${parsed.insights?.length || 0}`);
        } catch (e) {
            console.error('[Audit JSON Error] Failed to parse response:', responseText);
            throw new Error('A IA retornou um formato inválido. Tente novamente.');
        }

        return res.status(200).json({
            ...parsed,
            model_used: MODEL_NAME
        });

    } catch (error: any) {
        console.error('[Audit Error]:', error);
        return res.status(500).json({
            error: 'Erro na Auditoria',
            details: error.message || String(error)
        });
    }
}
