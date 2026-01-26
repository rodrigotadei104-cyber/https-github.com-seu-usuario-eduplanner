import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    runtime: 'edge', // Usar Edge para ser mais rápido e evitar cold start de Node
};

export default async function handler(request: Request) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    // Mostrar primeiros e últimos caracteres para confirmar se é a chave certa sem vazar tudo
    const maskedKey = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING';

    const logs = [];
    logs.push(`Timestamp: ${new Date().toISOString()}`);
    logs.push(`API Key Status: ${apiKey ? 'Present' : 'Missing'}`);
    logs.push(`Key Fingerprint: ${maskedKey}`);

    try {
        if (!apiKey) throw new Error("API Key is undefined in environment variables");

        const genAI = new GoogleGenerativeAI(apiKey);
        // Testar exatamente o modelo que estamos tentando usar
        const modelName = 'gemini-2.0-flash-exp';
        logs.push(`Initializing model: ${modelName}`);

        const model = genAI.getGenerativeModel({ model: modelName });

        logs.push("Sending request to Google...");
        const start = Date.now();

        // Timeout de segurança manual para o fetch do Google
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Google API Timeout (5s)")), 5000)
        );

        const generationPromise = model.generateContent("Reply with 'OK' only.");

        const result: any = await Promise.race([generationPromise, timeoutPromise]);

        const end = Date.now();
        logs.push(`Success! Time: ${end - start}ms`);

        const text = result.response.text();
        logs.push(`Response from AI: ${text}`);

        return new Response(JSON.stringify({ status: 'success', logs }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        logs.push(`CRITICAL ERROR: ${error.message}`);
        if (error.status) logs.push(`HTTP Status: ${error.status}`);
        if (error.errorDetails) logs.push(`Details: ${JSON.stringify(error.errorDetails)}`);

        return new Response(JSON.stringify({ status: 'error', logs, error: error.toString() }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
