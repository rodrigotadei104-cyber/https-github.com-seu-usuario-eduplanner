import React from 'react';
import { createRoot } from 'react-dom/client';
import { TurmasView } from '../../../components/TurmasView';
import { useSchedule } from './fixture';
import '../../../index.css';
function Review() {
  const { trace } = useSchedule();
  return <div className="h-screen bg-slate-100 p-6"><p className="mb-2 text-xs text-slate-500">Teste local com dados fictícios — nenhum acesso ao banco de produção</p>
    <div role="status" className="mb-2 text-xs">Operações: {trace.join(' → ') || 'nenhuma'}</div><div className="h-[90vh]"><TurmasView /></div></div>;
}
createRoot(document.getElementById('root')!).render(<Review />);
