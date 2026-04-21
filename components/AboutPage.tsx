import React from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { EduPlannerLogo } from './EduPlannerLogo';

export const AboutPage: React.FC = () => {
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

                    {/* Hero Section */}
                    <div className="flex flex-col items-center justify-center text-center mb-12">
                        <div className="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/30 rounded border border-indigo-200 mb-6 font-black text-indigo-600 uppercase tracking-widest text-xs">
                          [ INSTITUCIONAL ]
                        </div>
                        <h1 className="text-4xl font-black mb-3 tracking-tighter text-gray-900 dark:text-white uppercase">SOBRE O EDUPLANNER</h1>
                        <p className="text-gray-400 dark:text-gray-400 font-black text-[10px] uppercase tracking-[0.3em]">Versão 1.0 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-12">

                        {/* O que é */}
                        <section>
                            <h2 className="text-sm font-black text-indigo-600 dark:text-white mb-4 uppercase tracking-widest border-b pb-1 inline-block">[ DEFINIÇÃO ]</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 text-lg font-medium">
                                O EduPlanner é uma plataforma digital desenvolvida para apoiar instituições educacionais na gestão eficiente de agendas, aulas, instrutores e salas, de forma simples, organizada e segura.
                            </p>
                            <p className="mt-4 leading-relaxed text-gray-600 dark:text-gray-300">
                                Projetado para escolas, centros de treinamento, unidades de capacitação e instrutores, o EduPlanner facilita o planejamento e acompanhamento de atividades acadêmicas, garantindo controle e transparência para todos os envolvidos.
                            </p>
                        </section>

                        {/* Objetivo */}
                        <section className="bg-gray-50 dark:bg-slate-700/30 p-8 rounded-2xl border border-gray-100 dark:border-slate-600 text-[11px] uppercase font-black tracking-widest">
                            <h2 className="text-sm font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tighter">[ OBJETIVOS ]</h2>
                            <p className="mb-6 text-gray-500 dark:text-gray-400">
                                CENTRALIZAR E OTIMIZAR A ROTINA OPERACIONAL:
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-4">
                                {[
                                    'CONTROLE ESTRUTURADO DO CALENDÁRIO',
                                    'VISÃO CLARA DA CARGA HORÁRIA',
                                    'REDUÇÃO DE ERROS E SOBREPOSIÇÕES',
                                    'AUTONOMIA PARA EQUIPES PEDAGÓGICAS',
                                    'HISTÓRICO RASTREÁVEL DE AÇÕES'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                        <span className="text-indigo-600">•</span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* Composição Técnica */}
                        <section>
                            <h2 className="text-sm font-black text-indigo-600 dark:text-white mb-4 uppercase tracking-widest border-b pb-1 inline-block">[ TECNOLOGIA ]</h2>
                            <p className="text-[10px] font-black text-gray-400 mb-6 uppercase tracking-widest">ARQUITETURA MODERNA E SEGURA:</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                              {[
                                'NEXT.JS', 'SUPABASE', 'RESEND', 'VERCEL', 'AUDIT LOGS', 'MULTI-TENANT'
                              ].map((tech, i) => (
                                <div key={i} className="p-4 border border-gray-100 rounded bg-white shadow-sm font-black text-[10px] text-center uppercase tracking-widest">
                                  {tech}
                                </div>
                              ))}
                            </div>
                        </section>

                        {/* Responsável e Agradecimento */}
                        <section className="bg-black text-white p-8 rounded-2xl mt-8">
                            <h2 className="text-[10px] font-black text-gray-400 mb-6 uppercase tracking-[0.3em]">[ RESPONSÁVEL ]</h2>
                            <div className="space-y-1 text-gray-300 mb-6 text-sm uppercase font-black tracking-tighter">
                                <p className="text-white text-lg">Rodrigo de Souza Tadei</p>
                                <p className="opacity-60 text-[10px]">Analista e desenvolvedor de soluções educacionais</p>
                                <p className="pt-2 text-indigo-400">classeestudiodigital@gmail.com</p>
                            </div>

                            <hr className="border-gray-800 my-8" />

                            <p className="text-[10px] font-black text-gray-500 italic uppercase tracking-widest text-center">
                                "Obrigado por utilizar o EduPlanner para gerenciar o conhecimento."
                            </p>
                        </section>

                    </div>
                </article>

                <footer className="text-center mt-12 text-gray-400 font-black text-[9px] uppercase tracking-widest pb-12">
                    <p>© 2026 EduPlanner. Protocolo de Direitos Reservados.</p>
                </footer>
            </main>
        </div>
    );
};
