# Simulador de planejamento por instrutor

Implementação local de 08/11/2026, base de produção `b4c78ee`. Sem instalação ou publicação desta funcionalidade até aprovação específica do deploy.

## Fluxo entregue

`Mapa de Instrutores → Simular planejamento`.

1. Selecionar instrutor ativo e período de até 180 dias, a partir de hoje.
2. Consultar agenda completa diretamente no banco, sem depender dos filtros ou erros silenciosos do contexto da tela.
3. Carregar a rotina semanal salva ou montar uma sugestão pelo histórico de agendamentos dos últimos 84 dias.
4. Revisar/ajustar os intervalos por dia da semana. Salvar a rotina para a unidade é uma ação explícita, disponível a administradores e editores.
5. Definir a duração desejada em minutos relógio. Ver faixas habituais livres e, opcionalmente, alternativas fora da rotina.
6. Escolher horário de início dentro de uma faixa e adicionar blocos ao rascunho. Blocos já simulados deixam de aparecer como livres.

A simulação não grava aulas nem reserva horários; rotinas não são inferidas/salvas automaticamente. A consulta não verifica salas. Trocar instrutor/período ou atualizar a agenda reinicia o rascunho e carrega novamente a rotina salva. Após cinco minutos, novos blocos exigem atualização da consulta.

## Histórico e disponibilidade

- Sugestão determinística, sem IA externa e sem custo por chamada de modelo. Mescla fragmentos/duplicidades do mesmo dia antes de inferir.
- Por dia da semana, usa minutos presentes em pelo menos dois dias distintos e em pelo menos metade dos dias com agendamentos observados. Intervalos sugeridos têm ao menos 30 minutos. Histórico insuficiente não produz uma rotina fictícia.
- O histórico não representa jornada contratual nem prova presença: a sugestão é um rascunho revisável.
- Rotinas podem ter até 28 intervalos semanais. Intervalos devem começar/terminar no mesmo dia e não se sobrepor; manhã/tarde/noite podem ser intervalos separados.
- Aulas e eventos não cancelados são ocupações. ID de instrutor prevalece sobre nome; registros sem ID são considerados pelo nome atual exato e identificados como legados.
- Férias bloqueiam o dia inteiro, mesmo com horário 00:00–00:00. Feriados/recessos ativos bloqueiam tanto a rotina quanto alternativas.
- Compromisso com horário inválido bloqueia o dia para conferência, em vez de produzir falso horário livre. Horários com segundos são arredondados de forma conservadora na ocupação.
- Intervalos sobrepostos/adjacentes são mesclados. Todas as faixas livres aparecem; as menores que o bloco escolhido são identificadas e não podem ser adicionadas até reduzir a duração. O tempo já passado de hoje é excluído.
- Fora da rotina significa alternativa a confirmar com o instrutor, não disponibilidade contratual garantida.

## Banco e permissões

Migração criada pela CLI oficial: `supabase/migrations/20261108202152_rotina_habitual_instrutores.sql`.

Tabela `instrutor_rotinas`, com chave tenant_id/instrutor_id, janelas JSON validadas, updated_at e updated_by. RLS ativa: leitura por usuário ativo da própria unidade; INSERT/UPDATE apenas admin/editor ativo, com instrutor válido da mesma unidade e identificação do próprio autor. Sem acesso anônimo e sem DELETE no fluxo.

RPCs SECURITY INVOKER com search_path vazio:

- `consultar_planejamento_instrutor`: leitura em um snapshot STABLE, incluindo rotina, aulas do período, eventos, calendário e histórico. Um JSON agregado evita o limite de 1000 linhas do REST. Erro de qualquer fonte impede o cálculo, sem tratar falha como agenda vazia.
- `salvar_rotina_instrutor`: validação no banco, versão otimista, lock por unidade/instrutor e auditoria transacional. Alteração concorrente exige recarregar. Falha no log reverte a rotina.

Nenhuma alteração de políticas das tabelas de aulas/eventos existentes. Nova política de INSERT de auditoria restrita ao próprio admin/editor da unidade para INSTRUCTOR_ROUTINE.

## Testes e revisão

- `node scripts/test_instructor_planning.mjs`: intervalos, duplicidades, almoço, alternativas, férias, calendário, erros de horário, tempo atual, rascunho, inferência, falhas de consulta, permissões e 80 cenários com comparação minuto a minuto de faixas livres.
- `node scripts/run_turma_changes_sql_test.mjs`: servidor PostgreSQL local NORMAL, vinculado somente a 127.0.0.1 em porta de teste. Executa fixtures em transação revertida e encerra o servidor no finally. Testa RLS efetivamente ativa, salvamento, conflitos de versão, tenant, viewer/inativo, calendário/histórico completo, precedência de ID, aula legada e rollback de auditoria. Também repete toda a suíte anterior de trocas e reagendamento.
- TypeScript e build do projeto passaram. Revisão de componentes: hooks estáveis, diálogo nativo com foco modal, labels acessíveis, erros explícitos, invalidação de respostas antigas e tratamento da rotina não salva.

**Correção no executor de testes:** verificou-se que PostgreSQL --single ignora RLS mesmo com SET ROLE. As verificações anteriores de regras internas de tenant/papel eram válidas, mas não demonstravam aplicação efetiva das políticas. O runner foi substituído pelo servidor normal e foi incluída a asserção row_security_active; a suíte completa anterior e nova passou nesse modo. Não houve mudança de RLS de aulas em produção por causa dessa descoberta.

Prévia manual isolada: `outputs/previa-planejamento-instrutor.html`, gerada por `node scripts/fixtures/instructor-planning-review/build-offline.mjs`. Dados fictícios e backend em memória. `?mode=viewer` e `?mode=error` permitem explorar os casos de leitura e falha. Não chama APIs de produção. A conferência visual automatizada permanece pendente, devido ao bloqueio de navegação local já observado na ferramenta; nenhum contorno foi utilizado.

## Conferência de contexto e publicação

Consulta somente leitura localizou `Deivid Diniz da Silva` ativo (`cda79d01-95ff-43a5-8aad-6c72e76e8fed`), com 156 agendamentos nos 84 dias anteriores e 34 futuros na data consultada. Existe também um cadastro Diniz inativo, sem aulas vinculadas na consulta; nenhum registro sem ID com nome contendo Diniz foi encontrado. Não unir cadastros automaticamente.

Antes de publicar, seguir `directives/DEPLOY_SAFETY_PROTOCOL.md` com aprovação específica. Destinos: Supabase `ubhtibihkpwocgazwtur`; GitHub `rodrigotadei104-cyber/https-github.com-seu-usuario-eduplanner`, main, autor `lenono95@gmail.com`; Vercel `rodrigo-tadeis-projects/eduplanner`.

Instalar somente esta migração em transação, validar a consulta no esquema real e rodar advisors. Não salvar rotina inferida real sem revisão explícita do usuário; não criar aulas para testar. Publicar via Git e confirmar o deploy/URL pública antes de anunciar disponibilidade.

## Correção de apresentação — caso Giovanna

Usuário informou ausência de disponibilidade de janeiro a maio. Consulta somente leitura confirmou zero aulas de 01/01 a 31/05/2027. A rotina salva tem intervalos de 3h/3h20 em vários dias, enquanto o bloco inicial era de 240 minutos. O cálculo filtrava essas faixas e a interface apresentava uma mensagem genérica, escondendo disponibilidade real.

A correção mantém todas as faixas livres, separa o total de faixas das que comportam o bloco e informa a duração disponível. Faixas menores exibem orientação e botão desabilitado; diminuir para 180 minutos libera os intervalos 13:00–16:20 e 19:00–22:00. Nenhum ajuste automático na rotina salva nem na agenda. Teste de regressão e comparação minuto a minuto cobrem também lacunas menores que o bloco.

## Correção da modelagem — jornada e pausas protegidas

A alteração acima resolveu a visibilidade das lacunas, mas não a origem do problema: horários de aulas, especialmente de 50 minutos, não definem jornada nem alimentação. O usuário informou a jornada real da Giovanna e confirmou: segunda a sexta 13:00–17:00 e 18:00–22:00, com janta protegida 18:00–19:00; sábado preservado.

- Nova coluna `instrutor_rotinas.pausas`, com intervalos semanais protegidos e descrição, validados no banco. Refeições e descansos são subtraídos tanto da jornada quanto das alternativas.
- Espaços entre turnos da jornada também são protegidos automaticamente. Portanto, sábado 08–12/13–17 não gera uma alternativa de aula 12–13.
- O histórico passa a ser visualizado como padrão de aulas, sem substituir a jornada automaticamente. Para copiar o padrão como rascunho, é necessário revisar jornada/pausas e confirmar antes do cálculo ou salvamento. Ajustes reiniciam os blocos simulados.
- A hora-aula de 50 minutos não altera a jornada. Blocos continuam em minutos de agenda; lacunas residuais menores que a aula não podem ser adicionadas como se comportassem o bloco.
- `salvar_rotina_instrutor` ganha quarto argumento opcional `p_pausas`. Chamadas antigas de três argumentos preservam as pausas existentes, em vez de apagá-las.
- A consulta inclui pausas/intervalos entre turnos como ocupações protegidas para clientes antigos. O cliente novo usa a configuração semanal no cálculo local para permitir revisão explícita do rascunho.
- RLS, controle de versão e auditoria são mantidos. Migração criada pela CLI: `20261108211704_planejamento_pausas_protegidas.sql`.

Testes cobrem janta dentro/fora da jornada, almoço entre turnos, aulas de 50 minutos, preservação de pausas por clientes antigos, consulta, permissões e auditoria. O ajuste real da Giovanna é feito via RPC, sob a identidade do solicitante identificado como Rodrigo Tadei (admin ativo e autor atual da rotina), com versão bloqueada e preservação de sábado/domingo. O usuário confirmou expressamente essa configuração; nenhuma aula deve ser alterada.

## Simplificação confirmada pelo usuário — dias e turnos úteis

O usuário rejeitou a configuração obrigatória e as sobras de minutos. Confirmou explicitamente: manter a sugestão do sistema e permitir escolher livremente o período de trabalho quando necessário. Esta seção substitui o fluxo anterior de edição/salvamento de jornada e pausas na tela principal.

- Consulta por instrutor/período já retorna dias e turnos, com horários e status Disponível/Ocupado/Na simulação. Não há campo de duração em minutos, formulário semanal de refeições ou confirmação de revisão obrigatória.
- Referência salva é usada automaticamente; sem ela, usa sugestão pelo histórico; sem histórico suficiente, apresenta referência inicial explicitamente ajustável, sem exigir cadastro.
- O botão **Escolher meus horários** permite definir dias da semana e até quatro períodos apenas para a simulação. Não modifica o cadastro compartilhado nem requer salvar uma jornada.
- Pausas cadastradas continuam consideradas por padrão. Uma opção explícita de exceção permite usar exatamente os períodos escolhidos, sem editar refeições. Mesmo em exceção, aulas/eventos/férias/feriados/recessos continuam respeitados.
- O resultado avalia o turno inteiro: uma aula 13:00–16:20 ocupa o turno 13:00–17:00. A sobra 16:20–17:00 não vira uma sugestão de aula. Quem quiser outro período pode escolhê-lo diretamente.
- Adicionar à simulação inclui o turno inteiro. Atualizar a agenda preserva o rascunho e sinaliza conflitos novos. Mudar o horário considerado não apaga os períodos já selecionados. Fechar a tela/trocar instrutor encerra o rascunho.
- Não há migração ou alteração real de rotina/aulas nesta simplificação. API, isolamento e dados existentes são preservados.

`utils/instructorTurns.ts` e testes adicionais validam turnos inteiros, ausência de sobras de aulas de 50 minutos, período escolhido fora da sugestão, exceção explícita de intervalos, bloqueios, sobreposição de rascunhos e conflitos após atualização.
