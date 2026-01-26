# Instruções para Backup Manual do Supabase

## 📦 Backup via Dashboard (Recomendado)

### Passo 1: Acessar Supabase Dashboard
1. Acesse: https://supabase.com/dashboard
2. Faça login com sua conta
3. Selecione o projeto **EduPlanner**

### Passo 2: Criar Backup Manual
1. No menu lateral, clique em **Database**
2. Clique na aba **Backups**
3. Clique no botão **Create Backup** (ou **Backup Now**)
4. Aguarde a conclusão do backup (pode levar alguns minutos)

### Passo 3: Validar Backup
1. O backup aparecerá na lista com timestamp
2. Status deve mostrar **Completed** ou **Success**
3. Anote o ID do backup para referência futura

**Nome sugerido (se permitir customização):**
```
eduplanner-recoverypoint-before-AI-scheduler-2026-01-24
```

---

## 🔧 Dump SQL Técnico via CLI (Opcional)

### Pré-requisitos
```bash
# Instalar Supabase CLI
npm install -g supabase

# Verificar instalação
supabase --version
```

### Obter Credenciais
1. Acesse Supabase Dashboard → Settings → Database
2. Copie:
   - **Host:** db.PROJECT_REF.supabase.co
   - **Database name:** postgres
   - **Port:** 5432
   - **User:** postgres
   - **Password:** [sua senha do banco]

### Gerar Dump Completo
```bash
# Navegar até o diretório do projeto
cd c:\Users\HP\Documents\App_EduPlanner

# Gerar dump (substitua [PASSWORD] e [PROJECT_REF])
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" > supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

**Ou usando Supabase CLI:**
```bash
# Login
supabase login

# Link ao projeto
supabase link --project-ref [PROJECT_REF]

# Dump
supabase db dump -f supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

### Validar Dump
```bash
# Verificar tamanho do arquivo (deve ter vários KB/MB)
ls -lh supabase/backups/supabase_dump_recoverypoint_20260124.sql

# Verificar conteúdo (primeiras linhas)
head -n 50 supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

---

## 🔐 Proteção do Deployment Vercel

### Via Dashboard
1. Acesse: https://vercel.com/dashboard
2. Selecione o projeto **eduplanner**
3. Vá em **Deployments**
4. Localize o deployment mais recente (produção)
5. Clique nos três pontos (...) → **Promote to Production** (se necessário)
6. Anote o **Deployment ID** e **URL**

### Criar Alias Permanente (Opcional)
```bash
# Via CLI
vercel alias set [DEPLOYMENT_URL] eduplanner-stable-20260124.vercel.app
```

---

## 💾 Backup do Storage (Se Aplicável)

### Verificar Storage
1. Acesse Supabase Dashboard → Storage
2. Verifique se há buckets criados
3. Se houver arquivos, prossiga com backup

### Exportar Arquivos
1. Para cada bucket:
   - Clique no bucket
   - Selecione todos os arquivos
   - Download em lote
2. Organize em pasta: `storage_backup_20260124/`
3. Compacte: `storage_backup_20260124.zip`

---

## ✅ Após Completar Todos os Backups

Atualize o arquivo `CHECKLIST_RECOVERY_20260124.md` marcando:
- [x] Backup do Supabase criado
- [x] Dump SQL gerado (se aplicável)
- [x] Deployment Vercel documentado
- [x] Storage exportado (se aplicável)

**Sistema estará 100% protegido e pronto para novas implementações!** 🔒
