# 🚨 PROTOCOLO DE SEGURANÇA MÁXIMA PARA DEPLOY (OBRIGATÓRIO)

**Data de Implementação:** 2026-05-13
**Status:** ATIVO - VIOLAÇÃO ACARRETA FALHA CRÍTICA DE MISSÃO

Este protocolo foi criado após um incidente grave de deploy em conta incorreta. NENHUM comando de 'deploy', 'push' ou 'link' pode ser executado sem seguir estes 3 passos rigorosos:

## 1. VERIFICAÇÃO DE IDENTIDADE (OBRIGATÓRIO)
Antes de QUALQUER ação externa, o agente DEVE rodar:
```powershell
vercel whoami
```
O resultado deve ser exibido explicitamente para o usuário.

## 2. CONFIRMAÇÃO DE ESCOPO
O agente deve perguntar:
"Estou logado na conta **[RESULTADO DO WHOAMI]**. O projeto destino é **[NOME DO PROJETO]**. Deseja prosseguir para o ambiente de **PRODUÇÃO**?"

## 3. TRAVA DE SEGURANÇA
NUNCA use a flag `--yes` ou `-y` em comandos de `link` ou `deploy` sem que a conta tenha sido validada visualmente pelo usuário no passo anterior.

---
**NÃO IGNORE ESTE PROTOCOLO. A SEGURANÇA DOS DADOS DO CLIENTE É A PRIORIDADE ZERO.**
