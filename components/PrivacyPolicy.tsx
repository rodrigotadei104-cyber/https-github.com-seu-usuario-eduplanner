import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { EduPlannerLogo } from './EduPlannerLogo';

export const PrivacyPolicy: React.FC = () => {
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
                            <Shield size={32} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">POLÍTICA DE PRIVACIDADE – EDUPLANNER</h1>
                        <p className="text-gray-500 dark:text-gray-400 font-medium">Versão 1.1 – Janeiro/2026</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">1. Introdução</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Esta Política de Privacidade descreve como o sistema EduPlanner coleta, utiliza, armazena e protege os dados pessoais de seus usuários, em conformidade com a Lei Geral de Proteção de Dados – Lei nº 13.709/2018 (LGPD).<br />
                                Ao utilizar o EduPlanner, você declara estar ciente e de acordo com os termos desta política.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">2. Controlador dos Dados (Responsável Legal)</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Rodrigo de Souza Tadei<br />
                                CPF: 175.501.178-45<br />
                                Contato Oficial (DPO): classeestudiodigital@gmail.com
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">3. Dados Coletados</h2>

                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">3.1. Dados fornecidos pelo usuário:</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Nome completo</li>
                                <li>E-mail corporativo</li>
                                <li>Função no sistema (Administrador, Editor, Visualizador)</li>
                                <li>Senhas de acesso (armazenadas com hash, nunca em texto puro)</li>
                            </ul>

                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">3.2. Dados gerados automaticamente:</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Logs de acesso</li>
                                <li>IP e informações do navegador/dispositivo</li>
                                <li>Registro de operações (auditoria)</li>
                                <li>Ações realizadas em aulas, agendas, cadastros</li>
                            </ul>

                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">3.3. Dados cadastrados pela administração:</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Instrutores, cursos, matérias, salas e agendas</li>
                                <li>Unidades participantes do sistema</li>
                            </ul>

                            <p className="mt-4 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg border-l-4 border-blue-500">
                                O EduPlanner não coleta dados sensíveis (saúde, biometria, orientação religiosa etc.).
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">4. Finalidades do Tratamento</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">Os dados são tratados exclusivamente para:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Garantir o acesso seguro ao sistema</li>
                                <li>Gerenciar aulas, instrutores, cadastros e rotinas acadêmicas</li>
                                <li>Enviar convites e mensagens operacionais por e-mail</li>
                                <li>Registrar auditoria e responsabilização de ações internas</li>
                                <li>Proteger a integridade e segurança das informações</li>
                            </ul>
                            <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium">
                                O EduPlanner não utiliza dados para marketing, remarketing ou venda de informações.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">5. Bases Legais (LGPD)</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">O tratamento está baseado em:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Execução de contrato – art. 7º, V</li>
                                <li>Legítimo interesse – art. 7º, IX</li>
                                <li>Consentimento – art. 7º, I (para e-mails operacionais)</li>
                                <li>Obrigação legal – art. 7º, II (logs e auditoria)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">6. Compartilhamento de Dados</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">
                                O EduPlanner utiliza provedores de infraestrutura confiáveis, com padrões internacionais de segurança:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Supabase – Autenticação e Banco de Dados</li>
                                <li>Vercel – Hospedagem Front-end</li>
                                <li>Resend – Envio de e-mails transacionais</li>
                                <li>Serviços internos de monitoramento e logs</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300">
                                Os dados não são compartilhados com terceiros para publicidade.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">7. Armazenamento e Prazos de Retenção</h2>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Dados de usuários ativos: enquanto o contrato estiver vigente</li>
                                <li>Dados de contas desativadas: armazenados até solicitação formal de exclusão</li>
                                <li>Logs de auditoria: mínimo de 12 meses</li>
                                <li>Backups automáticos: conforme política do provedor Supabase</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300">
                                Todos os dados ficam armazenados em ambiente seguro, criptografado e com controle de acesso.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">8. Segurança da Informação</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">O EduPlanner adota medidas técnicas e administrativas, incluindo:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Autenticação com controle de permissões (RBAC)</li>
                                <li>Hash de senhas (criptografia irreversível)</li>
                                <li>Políticas multi-tenant com isolamento por unidade</li>
                                <li>Registro imutável de logs</li>
                                <li>Proteção contra ações não autorizadas no backend</li>
                                <li>Auditoria contínua de ações administrativas</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">9. Direitos do Usuário</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">Conforme a LGPD, o titular pode solicitar:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Acesso aos dados pessoais</li>
                                <li>Correção de informações incorretas</li>
                                <li>Exclusão de dados, quando aplicável</li>
                                <li>Revogação de consentimento</li>
                                <li>Portabilidade</li>
                                <li>Explicação sobre tratamento de dados</li>
                            </ul>
                            <p className="mt-4 text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-slate-700/50 p-4 rounded-lg">
                                <strong>Solicitações podem ser feitas diretamente ao DPO:</strong><br />
                                <a href="mailto:classeestudiodigital@gmail.com" className="text-blue-600 hover:underline">classeestudiodigital@gmail.com</a>
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">10. Exclusão e Desativação de Conta</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">Usuários podem ser:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Desativados (perdem acesso imediato)</li>
                                <li>Excluídos mediante solicitação oficial</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300">
                                Dados essenciais podem ser mantidos de forma anonimizados para fins legais e auditoria.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">11. Cookies e Tecnologias</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300 mb-2">O sistema utiliza apenas:</p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                                <li>Cookies essenciais de sessão</li>
                                <li>Tokens temporários de autenticação</li>
                            </ul>
                            <p className="mt-2 text-gray-600 dark:text-gray-300 font-medium">
                                Nenhum cookie de rastreamento comercial é utilizado.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">12. Atualizações da Política</h2>
                            <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                Esta política pode ser alterada a qualquer momento.<br />
                                A versão vigente sempre estará disponível dentro da plataforma.
                            </p>
                        </section>

                        <section className="bg-gray-50 dark:bg-slate-700/30 p-6 rounded-xl border border-gray-200 dark:border-slate-600 mt-8">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">13. Contato do Responsável pelo Tratamento (DPO)</h2>
                            <div className="space-y-1 text-gray-700 dark:text-gray-300">
                                <p><strong>Rodrigo de Souza Tadei</strong></p>
                                <p>E-mail: <a href="mailto:classeestudiodigital@gmail.com" className="text-blue-600 hover:underline">classeestudiodigital@gmail.com</a></p>
                                <p>CPF: 175.501.178-45</p>
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
