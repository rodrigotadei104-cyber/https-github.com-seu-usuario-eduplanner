# Memória de Ambiente: EduPlanner

## Vercel
- **Conta principal de Deploy:** Rodrigo Tadei (`rodrigo-tadeis-projects`)
- **Projeto Vercel:** `eduplanner`
- **Link de Produção:** `https://eduplanner-alpha.vercel.app/` e `https://eduplanner-bjq21xf7o-rodrigo-tadeis-projects.vercel.app`

## Supabase
- **Ambientes:** Utilizado para autenticação, banco de dados PostgreSQL e Edge Functions (RPCs).
- **Projetos:** As credenciais atuais do `.env` e chaves JWT mapeiam para o banco de dados oficial de produção do EduPlanner. A política de RLS usa `tenant_id` ativamente.

> **Regra em Vigência (GEMINI.md):** 
> *Antes de realizar qualquer operação de 'deploy', 'push' ou conexão com serviços externos (Supabase, Vercel, GitHub, Hostinger, etc.): Pergunte explicitamente se o usuário deseja prosseguir com a conta específica e identifique o ambiente atual.*
