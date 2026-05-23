# Session Changelog — 22/04/2026

**Commit:** `cc4d5b8` | **Deploy:** Vercel (produção via push main)

---

## Bugs Corrigidos

### 1. Erro catastrófico ao criar turma
- **Causa:** `tenantId` hardcoded `'rodrigotadei104-cyber'` no `AberturaTurmaWizard.tsx` conflitava com o RLS do Supabase
- **Fix:** Usa `userProfile.tenantId` do ScheduleContext (sessão autenticada)
- **Arquivo:** `AberturaTurmaWizard.tsx` (linhas 17-18, 246-249)

### 2. Instrutores JA invisíveis para outros usuários
- **Causa:** Programas armazenados exclusivamente no `localStorage` de cada navegador; outros usuários não tinham as colunas criadas pelo admin Wilson
- **Fix:** `useEffect` que mescla origens únicas das aulas PROGRAMA do banco com programas locais
- **Arquivo:** `JovemAprendizView.tsx` (linhas 43-67)

---

## Melhorias de UX

### 3. Scroll Excel-like na aba Jovem Aprendiz
- Scroll horizontal para tabelas com muitas colunas
- Header sticky no topo durante scroll vertical
- Colunas DATA e DIA congeladas à esquerda durante scroll horizontal
- Container `main` condicional no `App.tsx` para views com scroll próprio
- **Arquivos:** `JovemAprendizView.tsx`, `App.tsx`

### 4. Colunas de programa mais compactas
- `min-w` reduzido de `120px` para `85px`, `max-w` de `110px`
- Padding e font-size ajustados para melhor densidade
- **Arquivo:** `JovemAprendizView.tsx`

### 5. Permissão Editor no Jovem Aprendiz (excluir)
- Novo método `deleteAulaPrograma` no `aula.service.ts` — usa `CREATE_CLASS` (admin+editor) em vez de `DELETE_CLASS` (admin-only)
- Valida `tipo_aula === 'PROGRAMA'` para impedir escalação de privilégio
- Exposto via `ScheduleContext` e consumido no `JovemAprendizView`
- **Arquivos:** `aula.service.ts`, `ScheduleContext.tsx`, `JovemAprendizView.tsx`

---

## Aprendizados Técnicos

- `sticky` CSS só funciona quando o container de scroll é o ancestral correto — containers intermediários com `overflow-auto` quebram a referência
- Para views full-height com scroll interno, o `main` do layout precisa ser `flex flex-col` sem `overflow-y-auto`
- Programas salvos em `localStorage` precisam de mecanismo de sync com o banco para funcionar em multi-usuário
- `tenantId` hardcoded é uma das causas mais comuns de falha silenciosa em sistemas multi-tenant com RLS
