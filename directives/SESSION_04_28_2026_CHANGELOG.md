# Session Changelog — 28/04/2026

**Commit:** `a84f2b9` | **Deploy:** Vercel (produção via push main)

---

## 🔐 Dados de Deploy (SEMPRE seguir protocolo de confirmação)

| Campo | Valor |
|-------|-------|
| **Plataforma** | Vercel |
| **Conta/Team** | `rodrigo-tadeis-projects` |
| **URL do projeto** | https://vercel.com/rodrigo-tadeis-projects/eduplanner |
| **Repositório GitHub** | `rodrigotadei104-cyber/https-github.com-seu-usuario-eduplanner` |
| **Branch de produção** | `main` |
| **Método de deploy** | `git push origin main` (Vercel auto-deploy via GitHub) |

> ⚠️ PROTOCOLO OBRIGATÓRIO: Mesmo com estes dados registrados, SEMPRE perguntar
> confirmação explícita do usuário antes de qualquer push/deploy.

---

## Bugs Corrigidos

### 1. Label "Menor" → "Aprendiz" na Agenda Mensal
- **Causa:** `MonthlyView.tsx` usava `Menor: ${aula.origem}` para aulas PROGRAMA
- **Fix:** Usa `Aprendiz` como label; instrutor real via `aula.instrutor`
- **Arquivo:** `components/MonthlyView.tsx`

### 2. Nome do instrutor e curso ausentes no card do Jovem Aprendiz
- **Causa:** `line1` concatenava tudo em uma string longa; `cursoNome` resolvia para `'Institucional'`
- **Fix:** Estrutura de 3 linhas idêntica à dos cards normais; `programaNome` usa `aula.materia` como fonte
- **Arquivo:** `components/MonthlyView.tsx`

### 3. Número da turma aparecia em cards do Jovem Aprendiz
- **Fix:** `turmaLabel` exibido apenas para `tipoAula !== 'PROGRAMA'`
- **Arquivo:** `components/MonthlyView.tsx`

### 4. Visualizadores sem acesso ao Jovem Aprendiz
- **Fix:** Role `viewer` liberado na rota `jovem-aprendiz`; prop `readOnly` desabilita select, botão Excluir e botão Colunas
- **Arquivos:** `App.tsx`, `components/JovemAprendizView.tsx`

### 5. Aba "Controle Administrativo" sem dados (logs vazios)
- **Causa raiz:** `permissionService.setCurrentUser()` nunca era chamado após login/restore session
- **Consequência:** `permissionService.isAdmin()` retornava `false` (role = `null`), bloqueando o carregamento de `systemLogs` e `users`
- **Fix:** `permissionService.setCurrentUser(id, role)` chamado imediatamente após obter o perfil, nos dois pontos: `login` e `restoreSession`
- **Arquivo:** `context/ScheduleContext.tsx`

---

## Aprendizados Técnicos

- `permissionService` usa variáveis de módulo (`let currentUserRole`); deve ser inicializado ANTES de `loadAllData()` ser chamado
- O campo `aula.materia` contém o nome real do programa JA (ex: "Assist. Log."), enquanto `aula.curso` fica como `'Institucional'` (valor fixo do backend)
- Para uniformidade visual de cards, estruturar sempre em 3 linhas independentes em vez de concatenar tudo na `line1`
