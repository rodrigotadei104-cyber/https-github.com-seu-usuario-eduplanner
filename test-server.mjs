// Servidor de teste local para a API de geração de cronograma
// Simula o ambiente Vercel para testar a função serverless

import { createServer } from 'http';
import handler from './api/generate-schedule.js';

const PORT = 3001;

const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Only handle POST to /api/generate-schedule
    if (req.method === 'POST' && req.url === '/api/generate-schedule') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                // Create Request object (Web API)
                const request = new Request('http://localhost:3001/api/generate-schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body
                });

                // Call the handler
                const response = await handler(request);

                // Send response
                res.writeHead(response.status, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });

                const responseBody = await response.text();
                res.end(responseBody);

            } catch (error) {
                console.error('Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Test server running at http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/generate-schedule\n`);
    console.log('Configure Vite to proxy /api requests to this server:');
    console.log('  proxy: { "/api": "http://localhost:3001" }\n');
});
