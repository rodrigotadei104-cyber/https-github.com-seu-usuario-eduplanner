
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        return res.status(500).json({ error: 'No API Key found on server' });
    }

    try {
        // Direct REST call to bypass SDK weirdness/versioning checks
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        return res.status(200).json({
            status: 'ok',
            method: 'direct_rest_v1beta',
            models: data.models || data,
            key_preview: key.substring(0, 5) + '...'
        });
    } catch (error: any) {
        return res.status(500).json({
            error: 'Failed to list models',
            details: error.message
        });
    }
}
