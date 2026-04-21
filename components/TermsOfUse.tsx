import React from 'react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const TermsOfUse: React.FC = () => {
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
                        <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded mb-4 font-black text-indigo-600 uppercase tracking-widest text-[10px]">
                            [ DOCUMENTO LEGAL ]
                        </div>
                        <h1 className="text-3xl font-black mb-2 tracking-tighter uppercase">TERMOS DE USO</h1>
                        <p className="text-gray-400 dark:text-gray-400 font-black text-[10px] uppercase tracking-[0.2em]">Versão 1.0 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">1. OBJETO</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Os presentes Termos de Uso regulam o acesso e utilização do sistema EduPlanner, plataforma digital destinada ao gerenciamento de aulas, instrutores e agendas acadêmicas, operada por:
                            </p>
                            <div className="mt-4 bg-gray-50 dark:bg-slate-700/50 p-6 rounded border border-gray-100 font-black text-[11px] uppercase tracking-widest leading-relaxed">
                                <p className="text-gray-700 dark:text-gray-200">RESPONSÁVEL: RODRIGO DE SOUZA TADEI</p>
                                <p className="text-gray-500 dark:text-gray-400">CPF: ***.501.***-**</p>
                                <p className="text-indigo-600">CONTATO: CLASSEESTUDIODIGITAL@GMAIL.COM</p>
                            </div>
                            <p className="mt-6 leading-relaxed text-gray-600 dark:text-gray-300 font-bold uppercase text-[12px] tracking-tight">
                                AO ACESSAR O SISTEMA, O USUÁRIO DECLARA TER LIDO, COMPREENDIDO E CONCORDADO COM TODAS AS DISPOSIÇÕES DESTE TERMO.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">2. USUÁRIOS E PERFIS</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2 font-medium">O EDUPLANNER POSSUI TRÊS CATEGORIAS ESTRUTURAIS:</p>
                            <ul className="space-y-2 text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">
                                <li className="flex items-center gap-2"><span className="text-indigo-600">/</span> ADMINISTRADOR</li>
                                <li className="flex items-center gap-2"><span className="text-indigo-600">/</span> EDITOR</li>
                                <li className="flex items-center gap-2"><span className="text-indigo-600">/</span> VISUALIZADOR</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">3. REGRAS DE UTILIZAÇÃO</h2>
                            <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-300">
                                <li className="font-medium">USAR O SISTEMA APENAS PARA FINS LEGÍTIMOS</li>
                                <li className="font-medium">MANTER CREDENCIAIS PROTEGIDAS</li>
                                <li className="font-medium">FORNECER INFORMAÇÕES VERDADEIRAS</li>
                            </ul>
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-600 font-black text-[10px] uppercase tracking-widest">
                                [ ! ] É PROIBIDO COPIAR DADOS, SUBVERTER O SISTEMA OU CONDUZIR ENGENHARIA REVERSA.
                            </div>
                        </section>

                        <section>
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-3 uppercase tracking-widest border-b pb-1 inline-block">4. RESPONSABILIDADES</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                USUÁRIOS RESPONDEM PELAS AÇÕES REALIZADAS COM SEU LOGIN. O EDUPLANNER RESPONDE PELA MANUTENÇÃO TÉCNICA E SEGURANÇA ESTRUTURAL DO AMBIENTE.
                            </p>
                        </section>

                        <section className="bg-black text-white p-6 rounded mt-8">
                          <h2 className="text-[10px] font-black text-gray-400 mb-4 uppercase tracking-[0.3em]">[ CONTATO LEGAL ]</h2>
                          <p className="text-sm font-black uppercase tracking-tighter">RODRIGO DE SOUZA TADEI</p>
                          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">CLASSEESTUDIODIGITAL@GMAIL.COM</p>
                        </section>

                    </div>
                </article>

                <footer className="text-center mt-12 text-gray-400 font-black text-[9px] uppercase tracking-widest pb-12">
                    <p>© 2026 EduPlanner. Protocolo de Termos Ativos.</p>
                </footer>
            </main>
        </div>
    );
};
