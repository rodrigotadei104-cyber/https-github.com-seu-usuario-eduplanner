# Session Changelog - 15/07/2026

**Assunto:** Feature de Aulas Extras - agendamento de aulas adicionais fora da carga horaria planejada
**Status:** Implementado, testado em localhost, deploy em producao realizado. Migration aplicada no Supabase de producao.

---

## Contexto

O sistema nao permitia agendar aulas alem do limite de carga horaria da materia. Em cursos com aulas praticas, o coordenador frequentemente precisa adicionar aulas extras em qualquer momento do curso (nao apenas no final), sem burlar a integridade dos dados de carga horaria regular.

Requisitos levantados com o usuario:
- A aula extra deve **contar** na carga horaria acumulada do curso.
- O sistema deve **ignorar o limite** de carga horaria da materia ao criar ou editar uma aula marcada como extra.
- Deve existir uma **sinalização visual clara** no calendário para distinguir essas aulas das regulares.
- A criacao e edicao ocorrem pelo mesmo fluxo (ClassModal), sem tela separada.

---

## Melhorias Implementadas

### 1. Novo campo `aula_extra` na entidade Aula

Adicionado o campo opcional `aulaExtra?: boolean` à interface `Aula`.

Arquivo afetado:
- `types.ts`

### 2. Migration de banco de dados

Criada a migration `020_add_aula_extra.sql` que adiciona a coluna `aula_extra BOOLEAN DEFAULT FALSE` na tabela `aulas`.

A migration foi aplicada manualmente no Supabase de producao via SQL Editor.

Arquivo criado:
- `supabase/migrations/020_add_aula_extra.sql`

### 3. Servico de aulas atualizado

O `aula.service.ts` foi atualizado para:
- Aceitar `aula_extra` no `AulaInput`.
- Persistir o campo `aula_extra` no `INSERT` do metodo `create`.
- Persistir o campo `aula_extra` no `UPDATE` do metodo `update`.

Arquivo afetado:
- `services/aula.service.ts`

### 4. Contexto atualizado

O `ScheduleContext.tsx` foi atualizado para:
- Mapear `aulas.aula_extra` (banco) para `aulaExtra` (estado React).
- Repassar `aula_extra` ao service nos metodos `addAula` e `updateAula`.

Arquivo afetado:
- `context/ScheduleContext.tsx`

### 5. Formulario - Toggle Aula Extra no ClassModal

Adicionado checkbox destacado visualmente no formulario de criacao/edicao de aulas:
- Etiqueta: **Aula Extra** com icone ⚡
- Descricao: "Permite criar ou editar esta aula desconsiderando o limite de carga horaria planejada da materia."
- Estilo: fundo ambar, borda ambar, abrange toda a largura do grid (md:col-span-2).
- Inicializado corretamente tanto para criacao (false) quanto para edicao (valor do banco).

Arquivo afetado:
- `components/ClassModal.tsx`

### 6. Badge EXTRA no Calendario Mensal

O card de aula no calendario mensal exibe uma etiqueta ambar **EXTRA** no canto superior direito quando `aulaExtra` for true.

Arquivo afetado:
- `components/MonthlyView.tsx`

### 7. Badge EXTRA na Visao Diaria

Os cards de aula na visao diaria exibem a badge **EXTRA** em tres locais:
- Card compacto (aulas < 70 min): ao lado do nome do curso.
- Card normal (aulas >= 70 min): ao lado do status.
- Popover de detalhes (hover): ao lado do horario.

Arquivo afetado:
- `components/DailyView.tsx`

---

## Validacao Tecnica

```bash
npm run build
# vite v6.4.1 building for production...
# 1590 modules transformed.
# built in 10.73s
```

Resultado: build sem erros.

Testado manualmente em localhost:3000:
- Criacao de aula extra com checkbox marcado.
- Badge EXTRA visivel na visao mensal.
- Badge EXTRA visivel na visao diaria (card e popover).

---

## Deploy

**Fluxo de deploy utilizado:**
1. `git add . && git commit -m "feat: adicionar funcionalidade de aulas extras com validacao e migracao sql"`
2. `git push origin feature/redesign-celula-dia-mensal` (Preview na Vercel)
3. `git checkout main && git merge feature/redesign-celula-dia-mensal --no-ff`
4. `git push origin main` (deploy automatico em Producao na Vercel)

**URL de producao:** https://eduplanner-alpha.vercel.app/

**Migration no Supabase de producao:** Aplicada manualmente via SQL Editor.

---

## Observacao Operacional - Credenciais Git

Durante esta sessao, houve conflito de credenciais Git no Windows (conta `lenono95-cyber` em cache vs. repositorio `rodrigotadei104-cyber`).

**Resolucao:**
- Credencial antiga removida via `cmdkey /delete:git:https://github.com`.
- URL remota atualizada com token PAT embutido: `git remote set-url origin https://rodrigotadei104-cyber:<TOKEN>@github.com/...`.
- Nova credencial salva permanentemente no Gerenciador de Credenciais do Windows via `cmdkey /generic:git:https://github.com /user:rodrigotadei104-cyber /pass:<TOKEN>`.

Para proximas sessoes de deploy, o push deve funcionar diretamente sem autenticacao interativa.
