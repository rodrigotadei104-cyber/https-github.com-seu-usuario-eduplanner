# Alterações de instrutor e sala por turma — implementação local

Data: 08/11/2026. Base: commit de produção `250380e`.

## Fluxo entregue

`Turmas → Ver agenda → Alterar instrutor ou sala`.

1. Escolher o recurso e a origem (um instrutor/sala ou explicitamente todas as origens da turma).
2. Escolher o novo instrutor ou sala, e marcar as datas. Há seleção de um período e de todas as datas.
3. Desmarcar disciplinas que devem ser preservadas.
4. Solicitar a prévia com antes/depois por aula e conflitos.
5. Confirmar. A agenda detalhada é atualizada após a gravação.

Somente aulas agendadas que ainda não começaram e possuem vínculo identificável são elegíveis. Limite de 500 aulas por operação. O fluxo não altera datas, horários, carga, conteúdo, padrão da turma ou aulas ainda não geradas. Reagendamento da grade não faz parte desta entrega.

## Gravação

- RPC `public.alterar_recursos_turma`, SECURITY INVOKER, sem alterar políticas RLS existentes de aulas.
- Política nova de INSERT de auditoria restrita a esta operação, pelo próprio editor/admin ativo da unidade. Produção não possuía política de INSERT nesta tabela.
- Verifica usuário ativo, papel admin/editor, tenant, vínculo único de turma e seleção de aulas futuras agendadas.
- Prévia valida os campos enviados pelo cliente e retorna um snapshot; confirmação exige que esse snapshot continue válido.
- Revalida ocupações por outras turmas e por eventos, incluindo férias do novo instrutor.
- Blocos pedagógicos da própria turma não são tratados como outra reserva.
- Confirmações em lote da mesma unidade são serializadas; as aulas são bloqueadas em ordem estável durante cada transação.
- A atualização e a auditoria são transacionais. Falha no lote reverte todas as linhas.
- Nenhum INSERT/DELETE de aulas; sem opção de forçar conflitos neste fluxo.
- A função é executável apenas por authenticated, com autorização interna adicional. Não usa service_role.

## Arquivos

- `components/TurmaChangesModal.tsx`
- `components/TurmasView.tsx`
- `utils/turmaChanges.ts`
- `services/turmaChanges.service.ts`
- Migração criada pela CLI oficial: `supabase/migrations/20261108145103_alterar_recursos_turma.sql`
- Testes: `scripts/test_turma_changes.mjs`, `scripts/test_turma_changes.sql`, `scripts/run_turma_changes_sql_test.mjs`.

Foi removida uma propriedade redundante e não declarada (`diasConcluidos`) do resumo interno de Turmas; o progresso continua usando `aulasDadas`, sem alteração do cálculo.

## Validação

- Build e checagem TypeScript do projeto passaram.
- Testes JavaScript validaram seleção por datas/origem, exclusão de disciplinas, aulas não elegíveis, permissões, prévia e confirmação com snapshot.
- A função SQL real foi executada em PostgreSQL 18 local descartável, com fixtures e políticas RLS de teste. Validou prévia sem gravação, troca dos recursos, isolamento entre unidades, bloqueio de viewer/inativo, conflitos, férias, nova ocupação após a prévia, snapshot obsoleto, preservação de dados e rollback integral após falha de armazenamento simulada.
- Esses testes não validam a instalação nem as políticas efetivas do banco remoto.
- Prévia independente com dados fictícios: `outputs/previa-alteracoes-turma-local.html`. Sem scripts externos e sem URL do Supabase de produção no pacote.
- A prévia pode ser regenerada com `node scripts/fixtures/turma-changes-review/build-offline.mjs`. As fixtures e o servidor local ficam em `scripts/fixtures/turma-changes-review/` e não chamam APIs de produção.
- A automação visual ficou pendente: a ferramenta não acessou o servidor local e bloqueou navegação em arquivo local. Nenhum contorno dessa política foi realizado. Revisar manualmente a prévia antes de publicar.

Para repetir os testes SQL no Windows com PostgreSQL 18, preparar um cluster descartável em `.tmp/turma-change-postgres` com `initdb` (usuário postgres, autenticação trust, UTF-8). Manter o servidor parado. Executar `node scripts/run_turma_changes_sql_test.mjs`; o runner usa o backend single-user, sem rede, e reverte todos os dados de teste ao final. O script SQL recusa banco com nome diferente de `eduplanner_turma_changes_test`.

## Instalação pendente — não publicar parcialmente

1. Obter aprovação do usuário conforme `directives/DEPLOY_SAFETY_PROTOCOL.md` e `.agent/ENVIRONMENT_MEMORY.md`.
2. Confirmar projeto Supabase de produção `ubhtibihkpwocgazwtur`, schema e permissões esperados. Aplicar **somente a nova migração**, após revisar o histórico remoto. Não executar `db push` de todo o histórico legado sem conciliação.
3. Verificar a função com prévia de aulas escolhidas, sem aplicar alterações reais de agenda sem escopo explícito.
4. Publicar os arquivos da funcionalidade no repositório `rodrigotadei104-cyber/https-github.com-seu-usuario-eduplanner`, branch main, Vercel `rodrigo-tadeis-projects/eduplanner`.
5. Conferir o fluxo autenticado com o usuário, incluindo o alcance selecionado e o resultado nos mapas.

## Instalação em produção autorizada em 08/11/2026

O usuário respondeu "sim" após identificar repositório, autor, branch, Supabase e Vercel. A CLI já autenticada confirmou `eduplanner-prod` (`ubhtibihkpwocgazwtur`); o conector MCP não tinha permissão.

O esquema remoto foi conferido, incluindo privilégios e políticas. Foi retirada a referência a `aulas.updated_at`, coluna inexistente em produção. O teste local usa agora essa mesma ausência. Como a auditoria tinha RLS habilitada sem políticas, foi adicionada somente a política de INSERT restrita descrita acima.

Não existe `supabase_migrations.schema_migrations` neste banco. A instalação executou somente o SQL deste arquivo em uma transação, via `supabase db query --remote=ubhtibihkpwocgazwtur --file .tmp/turma-install.sql --yes`, sem `db push` e sem criar histórico legado artificial.

Antes da instalação, o SQL e uma prévia real foram executados e revertidos integralmente. Após a instalação, outra prévia sob role `authenticated` confirmou a função. Nenhuma aula foi alterada. Testes PostgreSQL locais e build passaram novamente.

Publicação da interface em andamento; verificar o commit e a conclusão do deploy antes de considerar a entrega publicada.

## Correção de compatibilidade — turmas 706794 e 706254

A primeira versão exigia turma_id ou curso_id para liberar a seleção. As duas turmas reportadas possuem aulas legadas com esses campos nulos e nome_curso preenchido, que já eram exibidas por Turmas. Portanto, aulas futuras válidas ficavam excluídas da nova operação.

Foi preservado o nome original em `Aula.nomeCursoLegado` no carregamento. O filtro e a RPC agora aceitam o grupo legado identificado por tenant_id + numero_turma + nome_curso exato, quando curso_id e turma_id são nulos. Sem nome e sem IDs continua bloqueado. Cursos com nomes diferentes ou IDs diferentes não são unidos. Nenhuma identidade foi regravada nos registros existentes.

A migração incremental `20261108151456_alterar_recursos_turma_legado.sql` substitui somente a função, mantendo os privilégios e a auditoria. Testes de regressão cobrem seleção, gravação de turma legada, rejeição de cursos misturados e conflitos de outra turma com o mesmo número. Ambos os grupos reais passaram pela prévia sob authenticated em transação revertida antes e depois da instalação. Nenhuma aula de produção foi alterada.
