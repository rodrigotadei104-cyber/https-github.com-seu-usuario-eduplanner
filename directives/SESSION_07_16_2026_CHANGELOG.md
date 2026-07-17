# Session Changelog - 16/07/2026

**Assunto:** Feature "Importar com IA" no Catalogo de Cursos - cadastro de curso + disciplinas a partir de texto ou print, usando Gemini.
**Status:** Implementado, deploy em producao realizado e testado em producao (entrada por texto). Entrada por imagem/print usa o mesmo endpoint mas nao foi validada com uma imagem real.

---

## Contexto

O cadastro de cursos no Catalogo era 100% manual (botao "Novo Curso" + modais de curso/disciplina). O usuario queria enviar um texto OU um print da matriz curricular e o sistema cadastrar automaticamente curso e disciplinas.

Decisoes tomadas com o usuario:
- Entrada: texto **e** print (imagem).
- Coluna "Carga Horaria EAD": ignorada nesta versao (usa so a carga principal de cada componente).
- Validacao antes do deploy: preview da Vercel (mas o usuario optou por ir direto a producao apos o build passar).
- Nome do botao: "Importar com IA" (evitando conflito com o "Agente Criador" de aulas, que ja existe e e outra coisa).

---

## Implementacao (aditiva - nada existente alterado)

### 1. Endpoint serverless `api/parse-course.ts` (novo)
- Recebe `POST { text?, image? {data base64, mimeType} }`.
- Usa Gemini com `responseMimeType: application/json`.
- Prompt extrai: nomeCurso, tipoHoraMin, disciplinas[{nomeDisciplina, cargaHoras, tipoDisciplina, ordem}].
- Converte carga "HH:MM" para horas decimais (12:00 -> 12, 08:30 -> 8.5); le "hora aula X min" -> tipoHoraMin (default 60); mapeia Teorico/Pratico; ignora EAD.
- Normalizacao defensiva no servidor + carga total calculada pela soma das disciplinas.

### 2. Modal `components/ImportarCursoIAModal.tsx` (novo)
- Fluxo: input (textarea + upload de imagem) -> loading -> preview editavel -> salvando -> concluido.
- Carga total somada automaticamente (garante consistencia exigida pelo scheduleEngine).
- Gravacao reusa `catalogoService.importarCatalogoLote()` (ja existente e testado).

### 3. `services/catalogo.service.ts`
- Metodo novo `interpretarMatriz()` (apenas chama o endpoint de IA; nao grava).

### 4. `components/CatalogoView.tsx`
- Botao "Importar com IA" no header + estado/render do modal.

---

## Bug encontrado e corrigido em producao

Apos o primeiro deploy, o endpoint retornou "Falha ao interpretar a matriz". Causa raiz: o modelo **`gemini-2.0-flash` foi descontinuado pelo Google** (404 "no longer available" no generateContent, embora ainda apareca no ListModels).

Correcao: migrado para **`gemini-2.5-flash`** (estavel, multimodal, suporta generateContent e JSON mode). Confirmado via `/api/debug-models` que o modelo suporta generateContent.

Observacao: os endpoints `api/generate-schedule.ts` e `api/audit.ts` ainda apontam para o modelo morto, mas sao codigo orfao/nao usado no app. O botao "Agente Criador" de aulas usa o motor LOCAL `lib/scheduleEngine.ts` (nao Gemini), por isso nunca foi afetado.

---

## Validacao

```bash
npm run build   # ok
npx tsc --noEmit # sem erros
```

Teste em producao (POST real ao endpoint) com o exemplo "Excel Basico":
- Retorno correto: nomeCurso "Excel Basico", tipoHoraMin 50, 2 disciplinas (12h + 8h teoricas), total 20h.
- Testado e aprovado pelo usuario no app.

Pendente de teste: entrada por imagem/print (mesmo endpoint/modelo multimodal).

---

## Deploy

Fluxo: branch `feature/importar-curso-ia` (preview) -> merge `--no-ff` em `main` -> push (deploy automatico Vercel). Commits: `6c572d6` (feat), `5c4c50f` (merge), `500d5c0` (fix modelo).

**URL de producao:** https://eduplanner-alpha.vercel.app/

---

## Pendencias abertas (nao bloqueantes)

1. Rotacionar o PAT do GitHub exposto em texto puro na URL do `git remote origin`.
2. Apagar a branch `feature/importar-curso-ia` (ja mergeada).
3. Limpar codigo orfao apontando para modelo Gemini descontinuado (`ScheduleGenerator.tsx`, `api/generate-schedule.ts`, `api/audit.ts`).
4. Validar a entrada por imagem/print da feature nova.
