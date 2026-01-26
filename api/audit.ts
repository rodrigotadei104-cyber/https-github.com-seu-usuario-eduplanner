
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const { rows } = await request.json();

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return new Response(JSON.stringify({ error: 'No rows provided' }), { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Server misconfiguration: API Key missing' }), { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        // Using Gemini 2.0 Flash-Thinking as requested (or fallback to flash-exp if alias issues, but trying thinking first)
        // Known aliases: gemini-2.0-flash-thinking-exp-1219, gemini-2.0-flash-exp
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-thinking-exp-1219' });

        // Optimizing payload: Remove unnecessary fields to save tokens
        const minimalRows = rows.map((r: any) => ({
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
            1. Horários: O fim deve ser após o início. A carga horária deve fazer sentido (não mais que 10h/dia salvo exceções).
            2. Conflitos: O mesmo instrutor não pode estar em dois lugares ao mesmo tempo (se houver dados suficientes para saber).
            3. Datas: Datas passadas muito antigas ou datas futuras muito distantes (anos de diferença) podem ser erro de digitação.
            4. Duplicatas: Aulas idênticas no mesmo dia/horário.
            5. Inconsistência de Sala: Se fornecido, verifique se a sala comporta a aula (lógica simples).
            
            Retorne APENAS um JSON com o seguinte formato, sem markdown:
            {
                "insights": [
                    { "rowId": number, "severity": "high" | "medium" | "low", "message": "Texto curto do erro" }
                ]
            }

            Se não houver erros, retorne { "insights": [] }.
            Ignore linhas vazias ou cabeçalhos se passarem.

            Dados para Análise:
            ${JSON.stringify(minimalRows)}
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Extract JSON from potential markdown blocks ```json ... ```
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : '{}';

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            console.error("AI JSON Parse Error", e);
            parsed = { insights: [], error: 'Failed to parse AI response' };
        }

        return new Response(JSON.stringify(parsed), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Audit Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
