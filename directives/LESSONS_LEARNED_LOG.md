# 📚 Registro de Aprendizados e Evoluções do Sistema (Lessons Learned)

Este documento registra aprendizados técnicos, correções de rotas de protocolo e pendências arquiteturais descobertas ao longo das sessões para garantir que a IA futura tenha contexto imediato das restrições e padrões já validados neste ambiente.

---

### [2026-05-23] - Adaptação do Protocolo de Deploy e TypeScript Constraints

**1. Deploy Contextualizado (Git x Vercel CLI)**
- **O Problema:** A IA estava bloqueando deploys exigindo o comando `vercel whoami` para verificação de identidade. No entanto, este ambiente não possui a CLI logada localmente. O pipeline CI/CD funciona exclusivamente via interceptação do GitHub (Vercel atrelada ao repositório origin).
- **A Solução:** O `DEPLOY_SAFETY_PROTOCOL.md` foi reescrito. Agora a IA verifica o remoto via `git remote -v` e as credenciais locais do Git (`git config user.email`). A trava de segurança de pedir o consentimento do usuário antes do push continua obrigatória, mas a burocracia técnica que causava os erros foi sanada.

**2. Tipagem Estrita do SDK do Supabase (TypeScript)**
- **O Problema:** O método `insert().select()` do Supabase sem generics definidos na query de retorno estava fazendo o TypeScript inferir a resposta como `never[]`. Isso gerava falhas críticas de compilação como `Property 'id' does not exist on type 'never'`.
- **A Solução:** Ao processar o retorno dessas queries genéricas para rastreabilidade (ex: `AuditService`), sempre force o casting dinâmico para garantir que o compilador ignore a tipagem estrita da promise do Supabase: `(data as any[])[0]?.id`.

**3. UX e DB Architecture para Eventos Loteados (Férias)**
- **O Problema:** Cadastrar férias dia a dia era um processo insustentável. Ao mesmo tempo, mudar a estrutura do banco para aceitar campos de "data_inicio" e "data_fim" puros quebraria a lógica do calendário diário atual.
- **A Solução:** Adotou-se o padrão híbrido. No banco de dados, o sistema insere N eventos independentes (um para cada dia). Na Interface Gráfica, eles são condensados e lidos como um card único, permitindo "Edição/Exclusão em Lote". Mantém-se o calendário íntegro e poupa-se o usuário do trabalho repetitivo.

**4. ⚠️ DÍVIDA TÉCNICA PRIORITÁRIA (Lazy Loading)**
- O sistema ainda sofre com o carregamento agressivo de TODO o histórico do banco de dados simultaneamente (`aulaService.list({ includeRelations: true })`).
- A limitação dura do Supabase (`max_rows` = 1000) foi contornada via paginação interna (Loop com `.range`), mas isso apenas empurrou o problema de performance para frente.
- **Próximo Passo:** Mudar o paradigma no `ScheduleContext.tsx` e `aula.service.ts` para um carregamento preguiçoso atrelado à visualização do calendário atual (Lazy Loading por Month/Date Window), requisitando o backend sob demanda.
