import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Testa o handler real com provedor simulado, sem rede ou alteração de faturamento.
let providerError, lastParts, calls = 0;
globalThis.parseCourseProvider = class {
    getGenerativeModel(config) {
        assert.equal(config.model, 'gemini-3.8-flash');
        assert.equal(config.generationConfig.responseMimeType, 'application/json');
        return { generateContent: async parts => {
            lastParts = parts;
            calls++;
            if (providerError) throw providerError;
            return { response: { text: () => JSON.stringify({ nomeCurso: 'Teste', tipoHoraMin: 50,
                disciplinas: [{ nomeDisciplina: 'Segurança', cargaHoras: '01:30', tipoDisciplina: 'Teórica' }] }) } };
        } };
    }
};
const source = readFileSync(new URL('../api/parse-course.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const code = 'const GoogleGenerativeAI = globalThis.parseCourseProvider;\n' + compiled.replace(/^import .*;\r?\n/gm, '');
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const invoke = async body => {
    const res = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method: 'POST', body }, res);
    return res;
};
const oldKey = process.env.GEMINI_API_KEY;
const oldError = console.error;
try {
    process.env.GEMINI_API_KEY = 'fixture-not-a-real-key';
    console.error = () => {};
    for (const error of [Object.assign(new Error('Créditos esgotados'), { status: 402 }), new Error('[402 Payment Required] Your prepayment credits are depleted.')]) {
        providerError = error;
        const res = await invoke({ text: 'Matriz fictícia' });
        assert.equal(res.statusCode, 402);
        assert.equal(res.body.code, 'AI_CREDITS_DEPLETED');
        assert.match(res.body.error, /sem créditos/);
        assert.equal(res.body.details, undefined);
    }
    providerError = new Error('Falha diferente');
    assert.equal((await invoke({ text: 'Matriz fictícia' })).statusCode, 500);
    providerError = null;
    const success = await invoke({ text: 'Matriz fictícia' });
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.disciplinas[0].cargaHoras, 1.5);
    assert.equal(success.body.tipoHoraMin, 50);
    const image = { data: 'fixture-base64', mimeType: 'image/png' };
    assert.equal((await invoke({ image })).statusCode, 200);
    assert.deepEqual(lastParts[1].inlineData, image);
    const before = calls;
    assert.equal((await invoke({})).statusCode, 400);
    assert.equal(calls, before);
} finally {
    console.error = oldError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
}
console.log('OK: usa Gemini 3.8 Flash, encaminha texto e imagem e preserva normalização, validação e aviso de créditos.');
