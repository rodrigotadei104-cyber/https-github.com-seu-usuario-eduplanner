import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/resolveAulaTurmas.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { resolveAulaTurmas } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const aulas = [
    { tenant_id: 'A', turma_id: 'guindaste', numero_turma: '703601', sala: 'Sala 1' },
    { tenant_id: 'A', turma_id: 'guindaste', numero_turma: null, sala: 'Estacionamento 2' },
    { tenant_id: 'A', turma_id: 'guindaste', numero_turma: '   ', sala: 'Estacionamento 2' },
    { tenant_id: 'B', turma_id: 'guindaste', numero_turma: null },
    { tenant_id: 'A', turma_id: 'outra', numero_turma: null },
    { tenant_id: 'A', numero_turma: null },
    { tenant_id: 'A', turma_id: 'ambigua', numero_turma: '111' },
    { tenant_id: 'A', turma_id: 'ambigua', numero_turma: '222' },
    { tenant_id: 'A', turma_id: 'ambigua', numero_turma: null }
];
const original = structuredClone(aulas);
const result = resolveAulaTurmas(aulas);
assert.equal(result[1].numero_turma, '703601');
assert.equal(result[2].numero_turma, '703601');
assert.equal(result[1].sala, 'Estacionamento 2');
for (const i of [0, 3, 4, 5, 6, 7, 8]) assert.deepEqual(result[i], aulas[i]);
assert.deepEqual(aulas, original, 'A leitura não deve modificar os registros originais');
console.log('OK: recupera a turma pelo vínculo, preserva a sala e isola tenants e turmas ambíguas.');
