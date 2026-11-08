import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const root = path.resolve('scripts/fixtures/turma-changes-review');
const server = await createServer({ configFile: false, root, plugins: [
  { name: 'isolated-turma-changes', enforce: 'pre', resolveId(source) {
    if (source.endsWith('context/ScheduleContext') || source.endsWith('lib/supabase') || source === './tenant.service' || source === './permission.service') return path.join(root, 'fixture.tsx');
  } }, react(), tailwindcss()
], server: { host: '127.0.0.1', port: 3102, strictPort: true, fs: { allow: [process.cwd()] } } });
await server.listen(); server.printUrls();
