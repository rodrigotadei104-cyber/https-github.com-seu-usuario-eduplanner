import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';
import { ViewMode } from '../types';

interface AccessDeniedProps {
  onNavigateBack: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ onNavigateBack }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in zoom-in duration-300">
      <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6 dark:bg-red-900/20">
        <ShieldAlert size={48} className="text-red-500 dark:text-red-400" />
      </div>
      
      <h2 className="text-2xl font-bold text-gray-800 mb-2 dark:text-white">
        Acesso Negado
      </h2>
      
      <p className="text-gray-500 max-w-md mb-8 dark:text-gray-400">
        Seu perfil de usuário não possui permissão para visualizar esta tela. 
        Esta área é restrita a administradores ou funções específicas da unidade.
      </p>

      <button 
        onClick={onNavigateBack}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
      >
        <ArrowLeft size={20} />
        Voltar para o Dashboard
      </button>

      <div className="mt-12 pt-6 border-t border-gray-100 w-full max-w-sm dark:border-slate-700">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
          Segurança do Sistema
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Esta tentativa de acesso foi registrada nos logs de auditoria da unidade.
        </p>
      </div>
    </div>
  );
};