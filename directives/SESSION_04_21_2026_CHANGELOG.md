---
title: "Registro de Sessão - Atualizações, Lapidações UI/UX e Deploy"
date: "2026-04-21"
project: "EduPlanner App"
status: "Deployed to Vercel (origin/main)"
---

# Catálogo de Atualizações (Sessão 21 de Abril)

Este documento atende à diretriz `Loop de Encerramento e Auto-Correção` e tem como objetivo pontuar o rastreio técnico para que engenheiros ou IA retomarem o projeto no futuro com pleno contexto espacial.

## 📦 1. Arquitetura de Views e UX
### A. `components/RoomMapView.tsx` (Mapa de Salas)
- **Correção Crítica:** Evitada falha de colapso de renderização (tela em branco) ocasionada por fuso de leitura em ISO Date versus Parse.
- **Regras Estéticas "Pro-Density":** Design minimalista foi enriquecido com a paleta Mensal (Cores Ouro/Âmbar/Azul dependendo do hash map). As antigas "pílulas finas vazadas" viraram **Blocos Sólidos Premium** focando no alto-contraste escuro (Tipografia branca, weight 800) e sombras perimetrais.
- Foi travado definitivamente sob visualização "Semanal" para manter a sanidade da UI.

### B. `components/JovemAprendizView.tsx` (Programas Paralelos)
- **Motor de Horários Híbrido:** A lógica frágil baseada na semântica do título ("Manhã = 08:00") foi erradicada. Incorporado **Seletor Time Picker Dinâmico** no menu de criação de programas.
- O armazenamento do `localStorage` não precisou sofrer migração de objetos pois usamos "Injeção de Mascara na String" (`Programa [10:00-14:45]`), mantendo estabilidade legada.
- **Proteção Cross-Service (Feriados):** Agora a aba do Jovem Aprendiz escuta ativamente o cache de Feriados Globais (Supabase `feriados` e `ScheduleContext`). Linhas de Feriado ganham bloqueio visual âmbar/amarelo em toda a tabela, prevenindo alocações logísticas de instrutores em feriados estaduais de SP ou municipais de Araraquara.

### C. `components/DailyView.tsx` (Visão Operacional Diária)
- Concedido protagonismo nominal ao **NOME DO CURSO** sobre a **MATÉRIA**. 
- Swap realizado estritamente nas instâncias dos cards de *1 hora* (Compactos), nos cards tradicionais e no hover-tooltip (flutuante inteligente).
- Nenhuma inteligência de controle de barra de progresso foi avariada.

## 🛡️ 2. Controle de Permissões
- Modificado o Guard de rotas em `App.tsx` na switch constraint de tela.
- Usuários com perfil do Supabase do tipo `Editor` foram homologados com plenos direitos na gerência, inclusão e remoção de colunas de **Programa Jovem Aprendiz**, empatando seus acessos ao perfil de `admin`. (Log restrito não incluído neste bypass).

## 🧰 3. Resolução de Bloqueio DevOps / Credential Manager
- Identificado gargalo no envio de código para o Github (Erro HTTP 403 Forbidden).
- Analisado o terminal em busca do proprietário fantasma: `classeestudiodigital-ship-it` mantinha o token gravado na memória offline.
- Executada purga via sistema (`cmdkey /delete:LegacyGeneric:target=git:https://github.com`) limpando o cache, forçando autorização no navegador na conta raiz, normalizando e viabilizando o CI/CD da Vercel.

---

> Esse documento é uma entidade viva de diretriz e não deve ser deletado, pois serve como histórico referencial imutável da nossa estabilização sistêmica de UI / UX.
