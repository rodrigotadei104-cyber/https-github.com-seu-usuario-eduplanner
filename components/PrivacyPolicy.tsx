import React from 'react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const PrivacyPolicy: React.FC = () => {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-900 font-sans text-gray-800 dark:text-gray-200">
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10 border-b border-gray-100 dark:border-slate-700">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded">EDU</span>
                        <span className="font-black text-xl tracking-tighter text-gray-900 dark:text-white uppercase">EduPlanner</span>
                    </div>
                    <a
                        href="/"
                        className="text-[10px] font-black text-indigo-600 hover:text-black dark:text-indigo-400 dark:hover:text-white transition-colors uppercase tracking-widest"
                    >
                        [ VOLTAR AO SISTEMA ]
                    </a>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 md:p-12 border border-gray-100 dark:border-slate-700">
                    <div className="flex flex-col items-center justify-center text-center mb-10">
                        <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded mb-4 font-black text-emerald-600 uppercase tracking-widest text-[10px]">
                            [ SEGURANÇA & DADOS ]
                        </div>
                        <h1 className="text-3xl font-black mb-2 tracking-tighter uppercase">POLÍTICA DE PRIVACIDADE</h1>
                        <p className="text-gray-400 dark:text-gray-400 font-black text-[10px] uppercase tracking-[0.2em]">Versão 1.1 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">1. INTRODUÇÃO</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                ESTA POLÍTICA DE PRIVACIDADE DESCREVE COMO O SISTEMA EDUPLANNER COLETA, UTILIZA, ARMAZENA E PROTEGE OS DADOS PESSOAIS DE SEUS USUÁRIOS, EM CONFORMIDADE COM A LEI GERAL DE PROTEÇÃO DE DADOS – LEI Nº 13.709/2018 (LGPD).
                            </p>
                        </section>

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">2. DADOS COLETADOS</h2>
                            <div className="grid md:grid-cols-2 gap-6">
                              <div className="p-4 border border-gray-100 rounded">
                                <p className="font-black text-[10px] uppercase mb-2 text-indigo-600 tracking-widest">FORNECIDOS PELO USUÁRIO:</p>
                                <ul className="text-[11px] font-black uppercase text-gray-500 space-y-1">
                                  <li>• NOME COMPLETO</li>
                                  <li>• E-MAIL CORPORATIVO</li>
                                  <li>• FUNÇÃO E PERFIL</li>
                                </ul>
                              </div>
                              <div className="p-4 border border-gray-100 rounded">
                                <p className="font-black text-[10px] uppercase mb-2 text-indigo-600 tracking-widest">GERADOS PELO SISTEMA:</p>
                                <ul className="text-[11px] font-black uppercase text-gray-500 space-y-1">
                                  <li>• LOGS DE ACESSO</li>
                                  <li>• REGISTRO DE OPERAÇÕES</li>
                                  <li>• AUDITORIA DE AÇÕES</li>
                                </ul>
                              </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">3. SEGURANÇA DA INFORMAÇÃO</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 uppercase text-[12px] font-black tracking-tight">
                                O EDUPLANNER ADOTA MEDIDAS TÉCNICAS E ADMINISTRATIVAS, INCLUINDO CRIPTOGRAFIA DE SENHAS (HASH), ISOLAMENTO MULTI-TENANT POR UNIDADE E REGISTRO IMUTÁVEL DE LOGS DE AUDITORIA.
                            </p>
                        </section>

                        <section className="bg-black text-white p-6 rounded mt-8">
                          <h2 className="text-[10px] font-black text-gray-400 mb-4 uppercase tracking-[0.3em]">[ DPO / CONTATO ]</h2>
                          <p className="text-sm font-black uppercase tracking-tighter">RODRIGO DE SOUZA TADEI</p>
                          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">CLASSEESTUDIODIGITAL@GMAIL.COM</p>
                        </section>

                    </div>
                </article>

                <footer className="text-center mt-12 text-gray-400 font-black text-[9px] uppercase tracking-widest pb-12">
                    <p>© 2026 EduPlanner. Protocolo de Privacidade Ativo.</p>
                </footer>
            </main>
        </div>
    );
};
