
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('❌ Falha: Nenhuma chave encontrada no .env.local');
        return;
    }

    console.log(`🔑 Testando chave: ${key.substring(0, 5)}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            console.error('❌ Erro da API:', JSON.stringify(data.error, null, 2));
        } else {
            console.log('✅ Sucesso! Modelos disponíveis:');
            (data.models || []).forEach(m => {
                if (m.name.includes('gemini')) {
                    console.log(`- ${m.name.replace('models/', '')}`);
                }
            });
        }
    } catch (err) {
        console.error('❌ Erro de rede:', err.message);
    }
}

checkModels();
