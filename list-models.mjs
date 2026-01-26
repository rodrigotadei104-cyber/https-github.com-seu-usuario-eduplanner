// Listar modelos disponíveis
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = 'AIzaSyB22EuDP5sfJuAiXVsEkPer_VcbXsYDSzg';
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log('Listing available models...\n');

        const models = await genAI.listModels();

        console.log('Available models:');
        for (const model of models) {
            console.log(`- ${model.name}`);
            console.log(`  Supports: ${model.supportedGenerationMethods.join(', ')}`);
        }

    } catch (error) {
        console.error('ERROR:', error.message);
    }
}

listModels();
