import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const TermsOfUse: React.FC = () => {
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
                    <div className="flex flex-col items-center justify-center text-center mb-10">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mb-4">
                            <FileText size={32} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">TERMOS DE USO – EDUPLANNER</h1>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Versão 1.0 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Objeto</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Os presentes Termos de Uso regulam o acesso e utilização do sistema EduPlanner, plataforma digital destinada ao gerenciamento de aulas, instrutores e agendas acadêmicas, operada por:
                            </p>
                            <div className="mt-2 bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg">
                                <p className="text-gray-700 dark:text-gray-200"><strong>Responsável:</strong> Rodrigo de Souza Tadei</p>
                                <p className="text-gray-700 dark:text-gray-200"><strong>CPF:</strong> 175.501.178-45</p>
                                <p className="text-gray-700 dark:text-gray-200"><strong>Contato:</strong> classeestudiodigital@gmail.com</p>
                            </div>
                            <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-300 font-medium">
                                Ao acessar o sistema, o usuário declara ter lido, compreendido e concordado com todas as disposições deste Termo.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Usuários e Perfis</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">O EduPlanner possui três categorias de usuários:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Administrador</li>
                                <li>Editor</li>
                                <li>Visualizador</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300">
                                O acesso é individual, pessoal e intransferível.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Cadastro e Convite</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                O acesso depende de convite enviado pela administração, criação de senha pelo usuário e manutenção da conta ativa.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Regras de Utilização</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">O usuário compromete-se a:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Usar o sistema apenas para fins legítimos</li>
                                <li>Manter credenciais protegidas</li>
                                <li>Fornecer informações verdadeiras</li>
                                <li>Não tentar acessar áreas não permitidas</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300 font-medium text-red-600 dark:text-red-400">
                                É proibido copiar dados, subverter o sistema ou conduzir engenharia reversa.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. Responsabilidades</h2>
                            <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-300">
                                <li><strong>Usuários</strong> respondem pelas ações realizadas com seu login.</li>
                                <li><strong>Administradores</strong> respondem pelo conteúdo inserido e gestão interna.</li>
                                <li><strong>EduPlanner</strong> responde pela manutenção técnica e segurança do sistema.</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300">
                                Não nos responsabilizamos por conteúdos cadastrados pelos usuários.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Propriedade Intelectual</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Todo o sistema, layout, código e lógica pertencem ao criador. O usuário recebe licença limitada e revogável de uso.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Disponibilidade e Atualizações</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Podem ocorrer manutenções e atualizações programadas. Funcionalidades podem ser aprimoradas ao longo do uso.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Suspensão e Cancelamento</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                O acesso pode ser suspenso ou cancelado em caso de violação destes Termos, uso indevido, fraude ou solicitação administrativa.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">9. Privacidade e Proteção de Dados</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                O tratamento segue a LGPD e a Política de Privacidade vigente (<a href="/privacy" className="text-blue-600 hover:underline">/privacy</a>).
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">10. Isenção de Garantias</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                O sistema é fornecido como Software as a Service, sem garantia de resultado específico para cada instituição.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">11. Alterações dos Termos</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Os Termos podem ser atualizados a qualquer momento, com publicação imediata no sistema.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">12. Foro</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Este termo segue a legislação brasileira. Foro eleito conforme local do controlador ou contrato comercial aplicável.
                            </p>
                        </section>

                        <section className="bg-gray-50 dark:bg-slate-700/30 p-6 rounded-xl border border-gray-200 dark:border-slate-600 mt-8">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">13. Contato</h2>
                            <div className="space-y-1 text-gray-700 dark:text-gray-300">
                                <p><strong>Rodrigo de Souza Tadei</strong></p>
                                <p>E-mail: <a href="mailto:classeestudiodigital@gmail.com" className="text-blue-600 hover:underline">classeestudiodigital@gmail.com</a></p>
                            </div>
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
