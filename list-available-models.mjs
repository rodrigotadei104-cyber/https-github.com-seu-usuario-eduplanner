// Listar modelos disponíveis na API v1
const apiKey = 'AIzaSyCb8Vpb1Nu1FGHU02-wxVimkPxlQZ0L_Co';

async function listAvailableModels() {
    try {
        console.log('Listing available models from API v1...\n');

        const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;

        const response = await fetch(url);

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ ERROR:', response.status, error);
            return;
        }

        const data = await response.json();

        console.log('✅ Available models:\n');
        data.models.forEach(model => {
            console.log(`- ${model.name}`);
            console.log(`  Supported: ${model.supportedGenerationMethods.join(', ')}`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

listAvailableModels();
