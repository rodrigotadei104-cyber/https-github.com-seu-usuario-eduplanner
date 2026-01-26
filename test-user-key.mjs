// Teste da NOVA chave fornecida pelo usuário
import { GoogleGenerativeAI } from '@google/generative-ai';

const newApiKey = 'AIzaSyCb8Vpb1Nu1FGHU02-wxVimkPxlQZ0L_Co';
const genAI = new GoogleGenerativeAI(newApiKey);

async function testNewUserKey() {
    try {
        console.log('Testing NEW API key from user...');
        console.log('Key:', newApiKey.substring(0, 15) + '...\n');

        const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro' });

        const startTime = Date.now();
        const result = await model.generateContent('Say hello in 3 words');
        const endTime = Date.now();

        const response = await result.response;
        const text = response.text();

        console.log('✅ SUCCESS!');
        console.log('Model: gemini-1.0-pro');
        console.log('Response:', text);
        console.log('Time:', (endTime - startTime) + 'ms');
        console.log('\n🎉 A NOVA CHAVE FUNCIONA! Vou configurar no projeto.');

    } catch (error) {
        console.error('❌ ERROR!');
        console.error('Message:', error.message);
        console.error('Status:', error.status || 'N/A');
    }
}

testNewUserKey();
