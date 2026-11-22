# Cronograma de curso pela disponibilidade do instrutor

Data: 22/11/2026. Estado: implementado e validado localmente; publicação e conferência do esquema real pendentes de autorização específica de ambiente.

## Pedido e comportamento

Mapa de Instrutores → Simular planejamento → Montar cronograma de curso. A consulta de disponibilidade existente continua acessível na mesma janela, com impressão e rascunho independentes.

O usuário escolhe um curso do catálogo e um instrutor. O sistema propõe o começo e o término, distribuindo as disciplinas na ordem do catálogo, com desempate estável pelo ID. Não exige uma data de início do curso. “Procurar a partir de” é opcional e limita a busca; em branco, considera hoje. O prazo final também é opcional. Sem prazo, consulta os próximos 180 dias, limite explícito compatível com o simulador existente.

A referência de horários vem do cadastro/histórico ou da referência inicial ajustável. Horários por grupos de dias podem ser escolhidos só para a proposta. Pausas cadastradas e intervalos entre turnos continuam protegidos. Não há alteração de rotina compartilhada nem opção de ignorar refeições neste novo fluxo.

Um turno parcialmente ocupado não vira sugestão de sobra curta. A distribuição pode usar só parte do último turno para fechar a carga de uma disciplina/curso e pode compartilhar o turno entre disciplinas consecutivas. Cada disciplina deve corresponder a minutos inteiros; diferenças de catálogo e fracionamentos não representáveis são recusados, sem arredondamento silencioso. Horas-aula de 50/60 minutos são respeitadas.

O resultado informa carga distribuída e faltante, datas propostas e situação da sala. A falta de disponibilidade gera proposta parcial consultável, sem permitir criar uma turma incompleta. É possível editar datas/horários, retirar um dia e redistribuir ou reconsiderá-lo. Dias excluídos permanecem ao escolher sala ou atualizar agenda. Edições invalidam a conferência anterior; sobreposição, carga incorreta e datas fora dos turnos livres impedem a confirmação.

A sala é opcional para simular e obrigatória para criar. Ao escolhê-la, a proposta é recalculada considerando suas ocupações. O número da turma só é solicitado na etapa de criação. Não há IA, chamadas a modelos, novas dependências ou envio para ferramentas externas.

## Leitura e gravação

- `consultar_base_cronograma` agrega curso, todas as disciplinas, consulta completa do instrutor e ocupações da sala em uma resposta JSON. Não depende do limite de 1000 linhas da API para compromissos/disciplinas. Retorna apenas dados da unidade do usuário ativo; viewer pode consultar.
- `criar_turma_planejada` faz conferência sem escrita e confirmação transacional. Somente admin/editor ativo pode chamar. Identifica a unidade pela identidade autenticada, não pelo pedido.
- A confirmação exige o snapshot da conferência, compara catálogo/instrutor/rotina/proposta e verifica novamente aulas (inclusive legadas por nome), eventos, férias, pausas, feriados e bloqueios. Valida todos os minutos por disciplina, datas futuras, inexistência de sobreposição e número de turma ainda livre na unidade.
- A turma, todas as aulas e sua auditoria são inseridas na mesma transação. Falha em qualquer aula ou no log reverte tudo. Não modifica aulas existentes.
- O UUID do pedido é também o ID da turma. Repetir uma confirmação após perder a resposta reconhece a turma existente apenas se curso, instrutor, número, sala e conjunto completo de aulas forem os mesmos. Não duplica aulas nem auditoria. A tela congela o pedido em caso de resposta incerta e oferece “Verificar criação”.
- Ambas as funções são SECURITY INVOKER, com `search_path` vazio e execução revogada de PUBLIC/anon. A única política nova permite INSERT de auditoria desta operação pelo próprio admin/editor ativo da unidade. Não altera políticas existentes, nem usa chave de serviço.

## Concorrência e limite operacional

Os fluxos antigos de gravação individual não usam o advisory lock dos lotes. Na confirmação nova, `aulas`, `events` e `turmas` recebem SHARE ROW EXCLUSIVE, enquanto catálogo/disciplinas/rotinas/feriados/bloqueios recebem SHARE. Isso permite leituras e serializa a conferência final com gravações antigas, evitando que duas pessoas ocupem o mesmo intervalo durante a transação. Não há espera por revisão humana, rede externa ou IA com os locks abertos. O `lock_timeout` é de 3 segundos por espera; em contenção, a operação falha e mantém o rascunho.

Esses locks alcançam as tabelas compartilhadas entre unidades durante a confirmação. É um custo explícito desta implementação aditiva; acompanhar latência/volume antes de aumentar o limite de 500 aulas. Não foram criados triggers globais nem restrições de sobreposição em dados legados. O snapshot detecta mudanças de referência observadas antes da última conferência; disponibilidade declarada pelo histórico continua sendo sugestão ajustável pelo usuário.

## Validação local

- `node scripts/test_course_planning.mjs`: cursos de 40h, 50/60 min, capacidade insuficiente, ordem, sábado, refeições, aulas/férias/feriados, exclusão de dias e edições inválidas. Contabilização independente minuto a minuto em 80 currículos.
- `node scripts/test_course_planning_service.mjs`: serviço real com transporte simulado, dados incompletos, isolamento, autorização, prévia/confirmação e respostas perdidas.
- `node scripts/test_instructor_planning.mjs` e testes de turma/reagendamento/conflito/sincronização/identificação já existentes passaram.
- `node scripts/run_turma_changes_sql_test.mjs`: PostgreSQL normal descartável em 127.0.0.1:55439, RLS efetivamente ativa sob authenticated. Inclui `test_course_planning.sql`: prévia sem gravação, isolamento, viewer/inativo/anon, conflitos inseridos após prévia, aula legada, sala normalizada, férias/feriados, snapshot obsoleto, refeições protegidas, 50/60 minutos, duplicidade e rollback da turma inteira quando falha a segunda disciplina. Tudo é revertido.
- Prévia isolada com serviços fictícios: `node scripts/fixtures/instructor-planning-review/build-offline.mjs`, depois `node scripts/fixtures/instructor-planning-review/server.mjs`. Somente o HTML fictício é servido em 127.0.0.1:3103; não usa o Supabase real.
- Revisão via Chrome: proposta de 40h, exclusão e preservação de dias ao escolher sala, bloqueio após edição com sobreposição, conferência, criação fictícia e recuperação de conexão. Consulta anterior preservou impressão e 36 turnos simuláveis. Console sem erros. Layout a 390px sem overflow da página; viewport restaurado.
- Evidência: `outputs/cronograma-curso-previa-20261122.png` (dados fictícios). A prévia não substitui a conferência autenticada em produção.

## Publicação e reversão

Seguir `DEPLOY_SAFETY_PROTOCOL.md` e `.agent/ENVIRONMENT_MEMORY.md`. Destinos previstos: GitHub `rodrigotadei104-cyber/https-github.com-seu-usuario-eduplanner`, main, autor `lenono95@gmail.com`; Vercel `rodrigo-tadeis-projects/eduplanner`; Supabase `eduplanner-prod`, referência `ubhtibihkpwocgazwtur`.

Antes de instalar, inspecionar em leitura o esquema/grants reais (incluindo colunas, tipos, defaults, RLS e privilégios de lock), catálogo e disponibilidade. Fazer preflight transacional da migração com rollback e chamadas de consulta/conferência sob authenticated. Não criar turmas reais para testar. Instalar isoladamente `20261122210859_cronograma_disponibilidade_curso.sql`; não executar db push de migrações antigas. Repetir leitura e advisors, então publicar frontend via Git após autorização e conferir deploy/bundle e interface autenticada.

Para reverter a interface, retornar ao commit anterior. As funções e a política novas podem permanecer sem uso ou ser removidas em migração reversa após reverter o frontend. Não excluir turmas/aulas legítimas criadas pelo usuário. A instalação desta migração só cria duas funções e uma política; não altera os dados da agenda.
