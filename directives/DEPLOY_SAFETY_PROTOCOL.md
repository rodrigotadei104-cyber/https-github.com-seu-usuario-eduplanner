# 🚨 PROTOCOLO DE SEGURANÇA MÁXIMA PARA DEPLOY (OBRIGATÓRIO)

**Data de Atualização:** 2026-05-23
**Status:** ATIVO - VIOLAÇÃO ACARRETA FALHA CRÍTICA DE MISSÃO

Este projeto (`App_EduPlanner`) possui CI/CD acoplado via GitHub (origin).
A CLI da Vercel **NÃO** está logada localmente neste repositório. O deploy ocorre estritamente via `git push`.

NENHUM comando de `git push` pode ser executado sem seguir estes passos rigorosos:

## 1. VERIFICAÇÃO DE IDENTIDADE E AMBIENTE (OBRIGATÓRIO)
Antes de enviar qualquer código para produção, o agente DEVE checar a identidade do repositório remoto:
```powershell
git remote -v
git config user.email
git status
```
O resultado deve ser interpretado para identificar claramente a conta (GitHub Remote) e o ambiente (Branch).

## 2. CONFIRMAÇÃO DE ESCOPO (TRAVA DE SEGURANÇA GLOBAL)
O agente deve parar e perguntar explicitamente:
"A conta destino para o push é **[NOME DA CONTA/REPOSITÓRIO REMOTO]** (Autor: **[EMAIL DO GIT]**). O ambiente/branch é **[NOME DA BRANCH]**. Deseja prosseguir com o push e acionar o deploy automático?"

## 3. TRAVA DE EXECUÇÃO
NUNCA execute o comando `git push` antes de receber um **"Sim" explícito e por escrito** do usuário em resposta à pergunta do Passo 2. Assumir permissão implícita resultará em falha crítica de protocolo.

---
**NÃO IGNORE ESTE PROTOCOLO. A SEGURANÇA DOS DADOS DO CLIENTE É A PRIORIDADE ZERO.**
