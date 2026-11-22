import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const html = new URL('../../../outputs/previa-planejamento-instrutor.html', import.meta.url);
createServer(async (req, res) => {
    if (new URL(req.url, 'http://127.0.0.1').pathname !== '/') { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(await readFile(html)); }
    catch { res.writeHead(500).end('Gere a prévia local antes de abrir.'); }
}).listen(3103, '127.0.0.1', () => console.log('Prévia isolada: http://127.0.0.1:3103/ (somente dados fictícios).'));
