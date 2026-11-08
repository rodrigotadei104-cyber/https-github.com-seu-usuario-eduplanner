import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('scripts/fixtures/turma-changes-review');
const result = await build({ configFile: false, root, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [
  { name: 'isolated-turma-changes', enforce: 'pre', resolveId(source) {
    if (source.endsWith('context/ScheduleContext') || source.endsWith('lib/supabase') || source === './tenant.service' || source === './permission.service') return path.join(root, 'fixture.tsx');
  } }, react(), tailwindcss()
], build: { write: false, minify: false, cssCodeSplit: false,
  lib: { entry: path.join(root, 'main.tsx'), name: 'TurmaReview', formats: ['iife'] },
  rollupOptions: { output: { inlineDynamicImports: true } } } });
const output = (Array.isArray(result) ? result[0] : result).output;
const js = output.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
const file = path.resolve('outputs/previa-alteracoes-turma-local.html');
writeFileSync(file, `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><title>Prévia local — alterações da turma</title><style>${css}</style><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></html>`);
console.log(file);
