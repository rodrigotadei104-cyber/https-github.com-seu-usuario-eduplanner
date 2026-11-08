# Reagendamento de aulas por turma

Implementação de 08/11/2026, inicialmente publicada no commit `bba3563`. Extensão de correção de aulas passadas descrita abaixo.

## Fluxo

`Turmas → Ver agenda → Reagendar aulas` para administradores e editores.

- Selecionar dias individualmente, todos ou por período.
- Preencher uma nova data para cada dia selecionado. Atalho de deslocamento em dias, calculado a partir das datas originais; não pula feriados automaticamente.
- Desmarcar disciplinas que devem ficar na data original.
- Revisar antes/depois e conflitos; somente depois confirmar.
- Atualizar a agenda detalhada após a gravação.

Aulas identificadas por turma_id, curso_id + numero_turma ou nome_curso legado + numero_turma, sempre na mesma unidade. Até 500 aulas por operação. Suporta o formato legado reportado nas turmas 706794/706254. A extensão abaixo inclui aulas antigas; as novas datas continuam obrigatoriamente no futuro.

## Banco

Migração criada pela CLI oficial: `supabase/migrations/20261108152450_reagendar_aulas_turma.sql`.

RPC SECURITY INVOKER `reagendar_aulas_turma(p_changes,p_expected,p_aplicar)` e política de INSERT de auditoria restrita ao próprio admin/editor ativo da unidade para esta operação. Não amplia leitura de tabelas nem altera políticas de aulas.

A confirmação verifica novamente o snapshot completo das aulas e as datas propostas. Bloqueia dados antigos, aulas repetidas, seleção entre turmas/unidades diferentes, datas inválidas, datas já iniciadas e mudanças sem efeito. Disciplinas selecionadas do mesmo dia recebem a mesma nova data.

Conflitos consideram as posições finais das aulas selecionadas, reservas externas de sala/instrutor, aulas da própria turma que não foram movidas, eventos, férias do instrutor, feriados ativos e datas bloqueadas ativas. Datas diferentes não podem ser comprimidas em horários sobrepostos. Fragmentos pedagógicos que já compartilhavam a data e o horário podem permanecer juntos.

Um único UPDATE altera somente `aulas.data`, preservando ID, disciplina, instrutor, sala, horários, carga e demais campos. Auditoria na mesma transação. Falha em qualquer linha reverte o lote inteiro. Sem INSERT/DELETE de aulas e sem opção de forçar conflito.

Bloqueios ordenados das aulas e advisory lock por unidade serializam este fluxo com as trocas de recurso em lote. Outros caminhos antigos de edição não adotam esse advisory lock; a verificação de conflitos é repetida no momento da confirmação, mas não constitui uma restrição global contra reservas simultâneas em todos os caminhos do sistema.

O reagendamento altera as aulas existentes escolhidas, não o padrão de geração de novas aulas nem os parâmetros cadastrais da turma.

## Verificação

- `node scripts/test_turma_reschedule.mjs`: datas locais, virada de ano, ano bissexto, datas inválidas, seleção/exclusão, preservação, permissões, payload de prévia e confirmação com snapshot.
- `node scripts/test_turma_changes.mjs`: regressão das trocas de instrutor/sala.
- `node scripts/run_turma_changes_sql_test.mjs`: PostgreSQL real local descartável. Inclui `scripts/test_turma_reschedule.sql`, além dos testes anteriores. Valida prévia sem escrita, gravação, preservação de todos os campos exceto data, auditoria, conflitos, férias, feriados, recessos, permuta de datas, colisões no lote, seleção inválida, dados obsoletos, turma legada, viewer/inativo, isolamento e rollback integral após falha simulada na segunda linha.
- Checagem TypeScript e build do projeto.
- Colunas de feriados e datas_bloqueadas de produção conferidas em consulta somente leitura.

Prévia independente com dados fictícios: `outputs/previa-alteracoes-turma-local.html`, regenerada com `node scripts/fixtures/turma-changes-review/build-offline.mjs`. Usa os componentes reais e backend simulado em memória; não chama a produção. A opção `?mode=conflict` simula conflito e `?mode=stale` simula prévia desatualizada.

Conferência visual automatizada pendente: a ferramenta já bloqueou a navegação local nesta sessão; nenhum contorno foi utilizado. A prévia é destinada à revisão manual e não substitui a conferência autenticada após instalar a função.

## Publicação pendente

Seguir `directives/DEPLOY_SAFETY_PROTOCOL.md` com aprovação explícita de destino e branch antes do push desta nova funcionalidade. Produção: Supabase `ubhtibihkpwocgazwtur`; GitHub `rodrigotadei104-cyber/https-github.com-seu-usuario-eduplanner`, main, autor `lenono95@gmail.com`; Vercel `rodrigo-tadeis-projects/eduplanner`.

Após aprovação, executar somente a nova migração em transação, validar prévia no esquema real sem reagendar aulas, publicar via Git e acompanhar o deploy. Não usar db push de todo o histórico legado: esse banco não tem histórico de migrações Supabase conciliado. Não reagendar aulas reais para testar sem seleção explícita do usuário.

## Extensão — corrigir aulas de datas passadas

Solicitada após aprovação da versão publicada. Caso real: turma 718319, aula 05/11/2026 18:40–22:00, ainda Agendada, deveria estar em 13/11/2026. O pedido é disponibilizar a correção, sem mover esse registro automaticamente durante o desenvolvimento.

- Aulas Agendadas passam a ser selecionáveis também em datas passadas. Troca de instrutor/sala mantém seu filtro original de aulas futuras; esta regra é específica do reagendamento.
- Como syncClassStatuses pode concluir aulas antigas automaticamente, existe uma opção explícita para incluir aulas Concluídas cujo fim já passou. Concluídas futuras, Canceladas e Em andamento permanecem excluídas.
- Toda seleção com datas/horários originais já iniciados exige justificativa de 10–1000 caracteres e confirmação na interface de que as aulas não ocorreram na data registrada.
- A prévia indica as aulas Concluídas que voltarão para Agendada. Só essas mudam de status; salas, instrutores, disciplinas, horários, carga e IDs continuam preservados.
- A justificativa é vinculada ao snapshot e registrada junto do status/data anteriores na auditoria. Destino passado continua bloqueado.
- Migração incremental criada pela CLI: `20261108200201_reagendamento_corrigir_datas_passadas.sql`. Substitui a assinatura de três argumentos por quatro, com `p_motivo text default ''`. Chamadas antigas de três argumentos continuam válidas para aulas futuras; prévias antigas sem o novo snapshot devem ser refeitas. Privilégios de execução são concedidos apenas a authenticated; a política de auditoria existente é mantida.
- A sincronização de status agora revalida data, horário e status no UPDATE, evitando concluir/iniciar uma aula que foi reagendada ou cancelada depois da leitura inicial.

Testes adicionais: passado Agendado, Concluído passado com opt-in, concluído futuro bloqueado, justificativa obrigatória/vinculada à prévia, reabertura para Agendada, histórico antes/depois, enum de status real no fixture PostgreSQL e concorrência do sincronizador (`scripts/test_sync_rescheduled_status.mjs`). Prévia real 05/11→13/11 validada em transação revertida, com hash da aula preservado. Nenhuma aula real reagendada para teste.
