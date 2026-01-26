// Teste da nova chave Gemini
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

// Ler a chave do .env.local
const envContent = fs.readFileSync('.env.local', 'utf-8');
const match = envContent.match(/GEMINI_API_KEY="(.+)"/);
const apiKey = match ? match[1].trim() : '';

console.log('Testing new Gemini API key...');
console.log('Key (first 20 chars):', apiKey.substring(0, 20) + '...');

const genAI = new GoogleGenerativeAI(apiKey);

async function testNewKey() {
    try {
        // Testar com gemini-1.0-pro primeiro
        const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro' });

        const startTime = Date.now();
        const result = await model.generateContent('Say hello in 3 words');
        const endTime = Date.now();

        const response = await result.response;
        const text = response.text();

        console.log('\n✅ SUCCESS!');
        console.log('Model: gemini-1.0-pro');
        console.log('Response:', text);
        console.log('Time:', (endTime - startTime) + 'ms');
        console.log('\n🎉 A chave está funcionando! Agora podemos fazer deploy.');

    } catch (error) {
        console.error('\n❌ ERROR!');
        console.error('Message:', error.message);

        if (error.status === 404) {
            console.log('\n💡 Tentando gemini-pro...');
            try {
                const model2 = genAI.getGenerativeModel({ model: 'gemini-pro' });
                const result2 = await model2.generateContent('Say hello');
                const response2 = await result2.response;
                console.log('✅ gemini-pro funciona!');
                console.log('Response:', response2.text());
            } catch (err2) {
                console.error('❌ gemini-pro também falhou:', err2.message);
            }
        }
    }
}

testNewKey();
