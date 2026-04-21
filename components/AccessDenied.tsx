import React from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { ViewMode } from '../types';

interface AccessDeniedProps {
  onNavigateBack: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ onNavigateBack }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in zoom-in duration-300">
      <div className="w-24 h-24 bg-red-50 rounded flex items-center justify-center mb-6 dark:bg-red-900/20 border-2 border-red-200 border-dashed">
        <div className="text-[12px] font-black text-red-600 uppercase tracking-widest">[ SECURITY ]</div>
      </div>
      
      <h2 className="text-2xl font-black text-gray-800 mb-2 dark:text-white uppercase tracking-tighter">
        ACESSO RESTRITO
      </h2>
      
      <p className="text-[11px] font-black text-gray-500 max-w-md mb-8 dark:text-gray-400 uppercase tracking-widest leading-loose">
        SEU PERFIL DE USUÁRIO NÃO POSSUI PERMISSÃO PARA VISUALIZAR ESTA TELA. 
        ESTA ÁREA É RESTRITA A ADMINISTRADORES OU FUNÇÕES ESPECÍFICAS DA UNIDADE.
      </p>

      <button 
        onClick={onNavigateBack}
        className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-200"
      >
        [ VOLTAR AO DASHBOARD ]
      </button>

      <div className="mt-12 pt-6 border-t border-gray-100 w-full max-w-sm dark:border-slate-700">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">
          PROTOCOLO DE SEGURANÇA
        </p>
        <p className="text-[9px] font-black text-gray-400 mt-1 uppercase tracking-widest opacity-60">
          ESTA TENTATIVA DE ACESSO FOI REGISTRADA NOS LOGS DE AUDITORIA DA UNIDADE.
        </p>
      </div>
    </div>
  );
};