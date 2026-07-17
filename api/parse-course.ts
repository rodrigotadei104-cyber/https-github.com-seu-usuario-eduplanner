import { GoogleGenerativeAI } from '@google/generative-ai';

// Node.js runtime, região IAD1 (via vercel.json). Mesma config do generate-schedule.
export const config = {
    maxDuration: 60,
};

const PRIMARY_MODEL = 'gemini-2.0-flash';

// ---------------------------------------------------------------------------
// Helpers de normalização (rede de segurança caso a IA devolva formatos crus)
// ---------------------------------------------------------------------------

// Converte carga em "HH:MM" (horas-aula) para número decimal. Ex.: "12:00" -> 12, "08:30" -> 8.5.
// Se já vier número, apenas arredonda para 2 casas.
function normalizarCarga(valor: any): number {
    if (typeof valor === 'number' && isFinite(valor)) {
        return Math.round(valor * 100) / 100;
    }
    if (typeof valor === 'string') {
        const limpo = valor.trim().replace(',', '.');
        // Formato HH:MM
        if (/^\d{1,4}:\d{1,2}$/.test(limpo)) {
            const [h, m] = limpo.split(':').map(Number);
            return Math.round((h + (m || 0) / 60) * 100) / 100;
        }
        const n = parseFloat(limpo);
        if (isFinite(n)) return Math.round(n * 100) / 100;
    }
    return 0;
}

// Normaliza o tipo da disciplina para os valores aceitos pelo catálogo.
// EAD é ignorado nesta versão (tratado como teórica).
function normalizarTipo(valor: any): 'teorica' | 'pratica' {
    const t = String(valor || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (t.includes('prat')) return 'pratica';
    return 'teorica';
}

function normalizarMinutosPorHora(valor: any): number {
    const n = Number(valor);
    if (isFinite(n) && n >= 30 && n <= 60) return n;
    return 60; // default institucional
}

export default async function handler(req: any, res: any) {
    // CORS (mesmo padrão dos demais endpoints)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            message: 'Course Parser API is ready',
            hasKey: !!process.env.GEMINI_API_KEY,
            region: process.env.VERCEL_REGION || 'unknown'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Configuration Error: GEMINI_API_KEY não definida nas variáveis de ambiente.' });
        }

        const { text, image } = req.body || {};
        const temTexto = typeof text === 'string' && text.trim().length > 0;
        const temImagem = image && image.data && image.mimeType;

        if (!temTexto && !temImagem) {
            return res.status(400).json({ error: 'Envie o texto da matriz ou uma imagem (print) para interpretar.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: PRIMARY_MODEL,
            generationConfig: { responseMimeType: 'application/json' }
        });

        const prompt = `
Você é um assistente do sistema EduPlanner. Sua tarefa é LER uma matriz curricular
(fornecida como texto e/ou imagem/print) e extrair a estrutura do curso em JSON.

REGRAS DE EXTRAÇÃO (obrigatórias):
1. "nomeCurso": o nome do curso (ex.: "Excel Básico").
2. Cada componente curricular / disciplina / matéria vira um item de "disciplinas":
   - "nomeDisciplina": o texto do componente curricular, sem alterações.
   - "cargaHoras": a carga horária do componente convertida para NÚMERO DECIMAL de horas-aula.
     - Se vier no formato "HH:MM", converta: "12:00" -> 12, "08:30" -> 8.5, "01:40" -> 1.67.
     - Se vier um número, use-o como está.
   - "tipoDisciplina": "teorica" ou "pratica". Mapeie "Teórico"->"teorica", "Prático"->"pratica".
     Na dúvida use "teorica".
   - "ordem": a posição do componente na lista (1, 2, 3, ...), na ordem em que aparecem.
3. "tipoHoraMin": a duração da hora-aula em minutos. Se o texto disser algo como
   "hora aula 50 minutos", use 50. Se não houver menção, use 60.
4. IGNORE a coluna "Carga Horária EAD". Use apenas a carga horária principal de cada componente.
5. NÃO invente componentes. Extraia apenas o que estiver na fonte.

FORMATO DE SAÍDA (JSON puro, sem comentários, sem markdown):
{
  "nomeCurso": "string",
  "tipoHoraMin": 60,
  "disciplinas": [
    { "nomeDisciplina": "string", "cargaHoras": 0, "tipoDisciplina": "teorica", "ordem": 1 }
  ]
}

${temTexto ? `TEXTO DA MATRIZ:\n${text}` : 'A matriz está na imagem anexa.'}
`.trim();

        const parts: any[] = [{ text: prompt }];
        if (temImagem) {
            parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
        }

        const result = await model.generateContent(parts);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed: any;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            console.error('[parse-course] Falha ao parsear JSON da IA:', cleaned?.slice(0, 500));
            return res.status(502).json({ error: 'A IA retornou um formato inesperado. Tente novamente ou revise a imagem/texto.' });
        }

        // Normalização defensiva do resultado
        const disciplinasRaw = Array.isArray(parsed?.disciplinas) ? parsed.disciplinas : [];
        const disciplinas = disciplinasRaw
            .map((d: any, idx: number) => ({
                nomeDisciplina: String(d?.nomeDisciplina || '').trim(),
                cargaHoras: normalizarCarga(d?.cargaHoras),
                tipoDisciplina: normalizarTipo(d?.tipoDisciplina),
                ordem: Number(d?.ordem) || idx + 1
            }))
            .filter((d: any) => d.nomeDisciplina.length > 0);

        if (disciplinas.length === 0) {
            return res.status(422).json({ error: 'Não foi possível identificar nenhum componente curricular na fonte enviada.' });
        }

        const tipoHoraMin = normalizarMinutosPorHora(parsed?.tipoHoraMin);
        const cargaTotalHoras = Math.round(
            disciplinas.reduce((acc: number, d: any) => acc + d.cargaHoras, 0) * 100
        ) / 100;

        return res.status(200).json({
            nomeCurso: String(parsed?.nomeCurso || '').trim(),
            tipoHoraMin,
            cargaTotalHoras,
            disciplinas
        });

    } catch (err: any) {
        console.error('[parse-course] Erro:', err);
        return res.status(500).json({
            error: 'Falha ao interpretar a matriz.',
            details: err?.message || String(err)
        });
    }
}
