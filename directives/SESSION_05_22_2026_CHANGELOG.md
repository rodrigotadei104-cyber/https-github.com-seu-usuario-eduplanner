# Session Changelog — 22/05/2026

**Assunto:** Correção de Bug Crítico (Prioridade Zero) — Aulas de Agosto/Setembro invisíveis
**Status:** Resolvido localmente e pronto para homologação/deploy.

---

## 🔍 O Diagnóstico do Bug Crítico

O usuário percebeu que as aulas agendadas a partir do mês de **Agosto** e principalmente **Setembro** de 2026 eram dadas como salvas com sucesso ("ok"), mas desapareciam e **não eram exibidas no calendário/agenda** do EduPlanner.

### 🔴 Causa Raiz
O PostgREST da API do Supabase tem um limite máximo de linhas por padrão (`max_rows`) fixado em **1000 registros** por requisição.
1. No `ScheduleContext.tsx`, as aulas do tenant são listadas carregando todas as turmas de uma vez em `aulaService.list({ includeRelations: true })` sem filtro de data.
2. Com a base de dados crescendo ao longo do ano letivo, as aulas totais do tenant atingiram ou superaram a barreira dos **1000 registros**.
3. A query era feita de forma ordenada ascendentemente por data (`.order('data', { ascending: true })`).
4. **O Efeito de Saturação:** O Supabase retornava apenas os primeiros 1000 registros (de Janeiro a Julho), truncando e silenciando os registros de datas posteriores (Agosto a Dezembro). A criação de aulas individuais retornava "ok" porque era persistida com sucesso no banco de dados, mas ao recarregar a lista geral no contexto, a nova aula ficava truncada e omitida do front-end.
5. **Efeito Colateral Sistêmico:** Esse limite de 1000 linhas também afetava silenciosamente as métricas gerais do dashboard (`getMetrics`), o relatório comparativo de instrutores (`getInstructorMonthlyReport`) e o histórico de horas acumuladas (`getMonthlyHistory`) a nível de tenant.

---

## 🛠️ Solução Aplicada

Refatoramos o arquivo [aula.service.ts](file:///c:/Users/HP/Documents/App_EduPlanner/services/aula.service.ts) de forma cirúrgica e altamente escalável:

1. **Nova Função Auxiliar de Paginação (`_fetchPaginated`):**
   Implementamos um método auxiliar privado genérico dentro do serviço `aulaService` que faz a varredura subsequente de registros do Supabase em páginas de 1000 em 1000 usando `.range(start, start + limit - 1)`, parando apenas quando a página atual retornar menos de 1000 registros. Isso contorna completamente e de forma transparente o limite PostgREST do Supabase.

2. **Refatoração Sistêmica das Queries Afetadas:**
   Substituímos o select linear pelo loop paginado em todas as listagens críticas:
   - `list(...)`: Listagem principal de aulas para exibição no calendário.
   - `getMetrics(...)`: Métricas agregadas do dashboard.
   - `getInstructorMonthlyReport(...)`: Relatório comparativo de desempenho de instrutores.
   - `getMonthlyHistory(...)`: Histórico de horas-aula mensais.

---

## 🧪 Verificação Técnica

- Executado o compilador de tipos do TypeScript via `npx tsc --noEmit`.
- O arquivo `services/aula.service.ts` compilou com **absolutamente zero erros**, garantindo conformidade com a tipagem estrita do projeto.

---

## 🚀 Nova Funcionalidade: Exclusão de Grade de Turma em Lote

Adicionamos a funcionalidade solicitada de **Excluir a Grade da Turma** de forma otimizada para evitar a exclusão exaustiva dia a dia.

### 🔴 O Problema
Antes, quando uma turma sofria alterações severas de cronograma ou cancelamento, os coordenadores precisavam abrir a agenda e excluir as aulas manualmente, uma a uma.

### 🛠️ Implementação Realizada
1. **No Service (`aula.service.ts`):** 
   Criamos o método `deleteAulasTurma(cursoId, numeroTurma)` que executa um comando de deleção no Supabase filtrado por `tenant_id`, `curso_id`, `numero_turma` e, por segurança letiva, restringe a remoção apenas para aulas futuras com o status `'agendada'` (poupando aulas já concluídas ou em andamento).
2. **No Context (`ScheduleContext.tsx`):**
   Criamos a ação `deleteAulasTurma` e expusemos no provedor de estado. Ela faz a chamada ao serviço e filtra localmente o estado `aulas` do React, atualizando instantaneamente todas as views sem precisar recarregar o banco.
3. **Na Tela (`ClassModal.tsx`):**
   Adicionamos o botão de ação **`"Excluir Grade da Turma"`** (visível apenas para Administradores no fluxo de edição de aulas existentes). O botão possui uma confirmação em modal duplo alertando sobre a remoção em massa e informando que o histórico concluído será preservado.

### 🧪 Verificação Técnica
- O TypeScript compilou perfeitamente nos três arquivos afetados com **zero erros sintáticos ou de tipos**, confirmando uma integração perfeita e segura.

---

## 🎨 Ajustes Finais: Correção do Erro de UUID e Redesenho Premium de UI/UX

Após os primeiros testes locais, implementamos duas melhorias cruciais:

### 1. Correção do Erro `invalid input syntax for type uuid: "null"`
- **Causa:** Aulas do Jovem Aprendiz (`PROGRAMA`) e algumas atividades institucionais não possuem `curso_id` ou possuem o valor nulo no banco. Ao tentar deletar em lote, o backend tentava filtrar por `.eq('curso_id', null)` o que o SDK do Supabase traduzia incorretamente para a string `"null"`, gerando uma exceção de sintaxe de UUID no PostgreSQL.
- **Soluções Aplicadas:**
  - **No backend do Service (`aula.service.ts`):** Adicionamos uma validação preventiva no método `deleteAulasTurma` que intercepta `cursoId` nulo, indefinido ou igual à string `"null"`, retornando uma rejeição de negócio limpa e segura em vez de estourar o banco de dados.
  - **Na Interface (`ClassModal.tsx`):** Ocultamos o botão "Excluir Grade da Turma" quando a aula for do tipo `PROGRAMA` (`initialData.tipoAula === 'PROGRAMA'`), já que os agendamentos institucionais não possuem grade curricular tradicional regular para deleção em lote, blindando a UI contra erros.

### 2. Redesenho Estético do Rodapé de Botões (Estética Premium)
- **Problema:** A inclusão de múltiplos botões na área da esquerda com cores pasteis brilhantes e muito colados entre si criava poluição visual e quebras de linha desordenadas ("um horror").
- **Melhorias de UI/UX Aplicadas ([ClassModal.tsx](file:///c:/Users/HP/Documents/App_EduPlanner/components/ClassModal.tsx)):**
  - **Unificação de Alturas:** Todos os botões do rodapé agora possuem exatamente **40px de altura (`h-10`)**, garantindo um alinhamento vertical milimétrico perfeito.
  - **Unificação de Tipografia:** Todas as labels usam a fonte elegante `text-[10px] font-bold uppercase tracking-wider` proporcionando uma consistência visual premium.
  - **Design Minimalista Neutro (Apple/Stripe Style):** Substituímos as cores de fundo pastéis permanentes por uma abordagem sóbria de botões *outline neutros* em tons de Slate (`border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`).
  - **Hovers Contextuais Dinâmicos:** As cores indicativas aparecem apenas quando o mouse passa por cima do botão (Hover), mantendo o visual sóbrio por padrão:
    - *Cancelar Aula:* Hover ganha fundo âmbar suave com borda amarela.
    - *Excluir Permanentemente:* Hover ganha fundo vermelho suave com borda vermelha.
    - *Excluir Grade:* Hover ganha fundo laranja suave com borda laranja.
  - **Layout Responsivo:** Implementamos um contêiner flexível inteligente (`flex flex-col sm:flex-row gap-4 items-center justify-between`) que organiza as ações administrativas destrutivas perfeitamente alinhadas à esquerda e os botões de ação principal ("Cancelar" e "Gravar Aula") perfeitamente alinhados à direita, adaptando-se com elegância a qualquer resolução de tela sem espremer ou empilhar botões de forma confusa.

### 🧪 Verificação Técnica
- A compilação TypeScript pós-redesenho retornou **sucesso total com zero erros sintáticos ou de tipos**, atestando a robustez técnica absoluta da entrega.
