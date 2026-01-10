import React from 'react';
import { ArrowLeft, Info, CheckCircle, Shield, Play } from 'lucide-react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const AboutPage: React.FC = () => {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-900 font-sans text-gray-800 dark:text-gray-200">
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <EduPlannerLogo className="w-8 h-8" />
                        <span className="font-bold text-xl tracking-tight text-gray-900 dark:text-white">EduPlanner</span>
                    </div>
                    <a
                        href="/"
                        className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        Voltar ao Sistema
                    </a>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <article className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12 border border-gray-100 dark:border-slate-700">

                    {/* Hero Section */}
                    <div className="flex flex-col items-center justify-center text-center mb-12">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-6">
                            <Info size={40} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <h1 className="text-4xl font-bold mb-3 tracking-tight text-gray-900 dark:text-white">SOBRE O EDUPLANNER</h1>
                        <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Versão 1.0 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-12">

                        {/* O que é */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">O que é o EduPlanner</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 text-lg">
                                O EduPlanner é uma plataforma digital desenvolvida para apoiar instituições educacionais na gestão eficiente de agendas, aulas, instrutores e salas, de forma simples, organizada e segura.
                            </p>
                            <p className="mt-4 leading-relaxed text-gray-600 dark:text-gray-300">
                                Projetado para escolas, centros de treinamento, unidades de capacitação e instrutores, o EduPlanner facilita o planejamento e acompanhamento de atividades acadêmicas, garantindo controle e transparência para todos os envolvidos.
                            </p>
                        </section>

                        {/* Objetivo */}
                        <section className="bg-blue-50 dark:bg-slate-700/30 p-8 rounded-2xl border border-blue-100 dark:border-slate-600">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Objetivo da Plataforma</h2>
                            <p className="mb-4 text-gray-700 dark:text-gray-300">
                                Centralizar e otimizar a rotina operacional de instituições que oferecem cursos, treinamentos e formações, proporcionando:
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-3">
                                {[
                                    'Controle estruturado do calendário de aulas',
                                    'Visão clara da carga horária e instrutores',
                                    'Redução de erros e sobreposições de agenda',
                                    'Autonomia para equipes pedagógicas',
                                    'Histórico rastreável de todas as ações'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                        <CheckCircle size={18} className="text-blue-500 mt-1 flex-shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* Funcionalidades */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Principais Funcionalidades</h2>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200 border-b pb-2 border-gray-200 dark:border-gray-700">Gestão & Agenda</h3>
                                    <ul className="space-y-2 text-gray-600 dark:text-gray-300 list-disc pl-5">
                                        <li>Cadastro de cursos, matérias e instrutores</li>
                                        <li>Agenda diária, semanal e mensal</li>
                                        <li>Dashboard com indicadores em tempo real</li>
                                        <li>Multi-tenant (isolamento por unidade)</li>
                                    </ul>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200 border-b pb-2 border-gray-200 dark:border-gray-700">Controle & Acesso</h3>
                                    <ul className="space-y-2 text-gray-600 dark:text-gray-300 list-disc pl-5">
                                        <li>Convites por e-mail para novos usuários</li>
                                        <li>Logs de cancelamentos e alterações</li>
                                        <li>
                                            Perfis de acesso distintos:
                                            <span className="block text-sm text-gray-500 mt-1 ml-2">• Administrador, Editor e Visualizador</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Publico Alvo */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Para Quem o EduPlanner Foi Criado</h2>
                            <p className="text-gray-600 dark:text-gray-300 mb-4">O EduPlanner atende especialmente:</p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    'Institutos de capacitação',
                                    'Escolas técnicas',
                                    'Centros educacionais',
                                    'Empresas com cursos internos',
                                    'Profissionais de ensino'
                                ].map((tag, i) => (
                                    <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium dark:bg-slate-700 dark:text-gray-300">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </section>

                        {/* Composição Técnica */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Composição Técnica</h2>
                            <p className="text-gray-600 dark:text-gray-300 mb-4">O sistema foi desenvolvido seguindo arquitetura moderna e segura:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Aplicação web (Next.js)</li>
                                <li>Autenticação e banco de dados em nuvem (Supabase)</li>
                                <li>Envio de convites e notificações (Resend)</li>
                                <li>Hospedagem escalável e confiável (Vercel)</li>
                                <li>Políticas de segurança com controle por perfil</li>
                                <li>Isolamento completo de dados entre unidades</li>
                            </ul>
                        </section>

                        {/* Compromisso */}
                        <section className="border-l-4 border-green-500 pl-6 py-2 bg-green-50/50 dark:bg-green-900/10">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Compromisso do EduPlanner</h2>
                            <p className="text-gray-600 dark:text-gray-300">Nosso compromisso é entregar:</p>
                            <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
                                <li className="flex items-center gap-2"><Shield size={16} className="text-green-600" /> Segurança e proteção</li>
                                <li className="flex items-center gap-2"><Shield size={16} className="text-green-600" /> Estabilidade operacional</li>
                                <li className="flex items-center gap-2"><Shield size={16} className="text-green-600" /> Simplicidade de uso</li>
                                <li className="flex items-center gap-2"><Shield size={16} className="text-green-600" /> Auditoria e transparência</li>
                                <li className="flex items-center gap-2"><Shield size={16} className="text-green-600" /> Evolução contínua</li>
                            </ul>
                        </section>

                        {/* Próximos Passos */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Próximos Passos e Evoluções Planejadas</h2>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Relatórios exportáveis</li>
                                <li>Integração com ferramentas de comunicação</li>
                                <li>Automatização inteligente de status</li>
                                <li>Multi-unidade ampliado para redes</li>
                                <li>Recursos de personalização avançada</li>
                            </ul>
                        </section>

                        {/* Responsável e Agradecimento */}
                        <section className="bg-gray-900 text-white p-8 rounded-2xl mt-8">
                            <h2 className="text-xl font-bold text-white mb-4">Responsável pelo Projeto</h2>
                            <div className="space-y-1 text-gray-300 mb-6">
                                <p className="font-medium text-white">Rodrigo de Souza Tadei</p>
                                <p>Analista e desenvolvedor de soluções educacionais</p>
                                <p>Contato: <a href="mailto:classeestudiodigital@gmail.com" className="text-blue-300 hover:text-white transition-colors">classeestudiodigital@gmail.com</a></p>
                            </div>

                            <hr className="border-gray-700 my-6" />

                            <h3 className="text-lg font-bold text-white mb-2">Agradecimento</h3>
                            <p className="text-gray-400 italic">
                                "Agradecemos cada escola, equipe e instrutor que contribui para que o EduPlanner evolua e entregue valor real no dia a dia acadêmico."
                            </p>
                        </section>

                    </div>
                </article>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>© 2026 EduPlanner. Todos os direitos reservados.</p>
                </footer>
            </main>
        </div>
    );
};
