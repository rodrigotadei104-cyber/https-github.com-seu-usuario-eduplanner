// Teste direto com API v1 (não v1beta)
const apiKey = 'AIzaSyCb8Vpb1Nu1FGHU02-wxVimkPxlQZ0L_Co';

async function testWithV1API() {
    try {
        console.log('Testing with API v1 (not v1beta)...\n');

        // Usar API v1 em vez de v1beta
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: 'Say hello in 3 words' }]
                }]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ ERROR:', response.status, error);
            return;
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        console.log('✅ SUCCESS with API v1!');
        console.log('Response:', text);
        console.log('\n🎉 A chave funciona com API v1!');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

testWithV1API();
