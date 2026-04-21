// Teste rápido da API Gemini
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyB22EuDP5sfJuAiXVsEkPer_VcbXsYDSzg';
const genAI = new GoogleGenerativeAI(apiKey);

async function testGemini() {
    try {
        console.log('Testing Gemini API...');
        console.log('API Key:', apiKey.substring(0, 10) + '...');

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });

        const startTime = Date.now();
        const result = await model.generateContent('Say hello in 3 words');
        const endTime = Date.now();

        const response = await result.response;
        const text = response.text();

        console.log('\n✅ SUCCESS!');
        console.log('Response:', text);
        console.log('Time:', (endTime - startTime) + 'ms');

    } catch (error) {
        console.error('\n❌ ERROR!');
        console.error('Message:', error.message);
        console.error('Details:', error);
    }
}

testGemini();
