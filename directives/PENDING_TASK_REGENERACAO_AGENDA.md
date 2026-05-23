# BRIEFING DE PAUSA TÉCNICA - REGENERAÇÃO SEGURA DE AGENDA

**Data do Registro:** 21 de Abril de 2026
**Impacto:** Núcleo Matemático / Engenharia de Software (Alta Complexidade)
**Modo Alvo:** `project-planner` e `backend-specialist`

Este manifesto foi criado após uma intensa sessão de refatoração estrutural no EduPlanner para reter o contexto histórico e tecnológico necessário sobre a **Regeneração Segura**, antes que qualquer codificação seja iniciada.

---

## 🛑 O Desafio Matemático e Operacional

Atualmente, o `scheduleEngine.ts` opera de forma **unidirecional**. A função `generateSchedule()` foi desenhada primariamente para a "Abertura de Turma", varrendo carga horária total e distribuindo pelas horas sequenciais até esgotar o pacote.

O cenário real das coordenações pedagógicas, no entanto, é caótico. Há troca de instrutores no meio do curso, feriados inseridos fora de época e turmas que pausam atividades. Recalcular essa agenda sem explodir os índices do Supabase (criados na Migração 018) exige um algoritmo purificador impecável.

## 🛠️ Fundações já Implementadas (Fase Pré-Pausa)

Para garantir que a próxima sessão parta de terreno sólido, é imperativo lembrar que o banco de dados já possui mecanismos de salvaguarda ("Hardening") estabelecidos na `Migration 018_regeneracao_segura_aulas.sql`:

1.  **Regras Unique Compound Indexes (Anti-Fantasmas):**
    *   `unique_turma_data_horario` (Bloqueia sobreposição de registro na mesma turma)
    *   `unique_sala_data_horario` (Bloqueia Overbooking de espaço físico)
    *   `unique_instrutor_data_horario` (Bloqueia clonagem do professor na mesma janela de tempo)
2.  **Tabela de Auditoria Dedicada:**
    *   O esquema `public.log_operacoes_agenda` existe exatamente para assinar operações maciças antes e depois que ocorrerem, guardando a matriz de impactos (`aulas_removidas`, `aulas_geradas`, e `conflitos_detectados`).

## 🎯 Requisitos para a Próxima Sessão (Fase de Escrita)

A tarefa deve ser iniciada criando um Documento Formal de Planejamento (Implementation Plan) baseado nas seguintes fundações arquiteturais obrigatórias:

### 1. Desidratação Limpa (Clean Slate Parcial)
A função `recalculateSchedule()` não pode ser destrutiva de forma cega.
*   **Preservar:** Aulas com status `concluida`, `em-andamento` ou `cancelada` são artefatos inalteráveis. O tempo letivo consumido por essas aulas deverá ser subtraído ativamente ("debitado") da carga máxima do curso em tempo real pela nova engine.
*   **Purgar:** O motor deverá identificar a partir da linha no tempo vigente ("Hoje" ou uma "Data de Corte" selecionada pelo Coordenador), selecionar rigorosamente as aulas do tipo `agendada` atreladas ao filtro afetado e deletá-las.

### 2. Recalibração de Deltas Manuais
Módulo crítico de falha: ao deletar o futuro, podemos deixar fragmentos temporais. Se o curso tem "10h", o passado consumiu 4.5h e o futuro consumia 5.5h, a nova engine não poderá gerar 10 horas e nem 5.5h arredondadas, deverá gerar exatamente o **Delta Final Restante da Geometria do Curso**. E não deve importar em qual bloco a aula anterior terminou. Se terminamos no meio de um slot de tempo, o próximo relógio parte do fracionamento.

### 3. Integração com API
*   Nova rota (possivelmente `/api/classes/regenerate` no back-end ou um service massivo em RPC caso o volume seja extenuante para edge computing via Axios/React).
*   Gatilho no Front-end: Modal "Safety Lock" antes de ativar a regeneração para evitar que coordenadores acidentais ativem a bomba relógio.

### 4. Gestão de Isolamento de Conflito
O algoritmo precisa simular a geração; se esbarrar em uma restrição `unique` no meio da linha do tempo, precisa avisar ao front-end e paralisar ("Fail Fast") ao invés de comitar metades de uma grade curricular preenchendo as brechas com aulas fantasmas espalhadas no banco.

---
**Next Step for AI:** Quando instanciado na próxima sessão para esse objetivo, leia este documento primeiro, abra o `Implementation Plan` e prepare a simulação estrutural seguindo este Briefing de Pausa.
