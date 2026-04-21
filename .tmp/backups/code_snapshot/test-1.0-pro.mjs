// Teste do gemini-1.0-pro (modelo original)
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = 'AIzaSyB22EuDP5sfJuAiXVsEkPer_VcbXsYDSzg';
const genAI = new GoogleGenerativeAI(apiKey);

async function testGemini10Pro() {
    try {
        console.log('Testing gemini-1.0-pro...');

        const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro' });

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
        console.error('Status:', error.status || 'N/A');
    }
}

testGemini10Pro();
