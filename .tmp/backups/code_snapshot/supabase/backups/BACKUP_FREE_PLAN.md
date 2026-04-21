# Backup Alternativo para Supabase Free Plan

Como o Free Plan não inclui backups automáticos, vamos usar o **pg_dump** para criar um backup completo manual.

## Opção 1: Via Supabase CLI (Recomendado)

### Passo 1: Instalar Supabase CLI
```bash
npm install -g supabase
```

### Passo 2: Login no Supabase
```bash
supabase login
```

### Passo 3: Link ao Projeto
```bash
cd c:\Users\HP\Documents\App_EduPlanner
supabase link --project-ref [SEU_PROJECT_REF]
```

Para encontrar o `PROJECT_REF`:
1. Acesse Supabase Dashboard
2. Settings → General
3. Copie o "Reference ID"

### Passo 4: Gerar Dump Completo
```bash
supabase db dump -f supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

Este comando vai gerar um arquivo SQL com:
- ✅ Todas as tabelas e dados
- ✅ Funções SQL
- ✅ Triggers
- ✅ Policies RLS
- ✅ Views
- ✅ Schemas

---

## Opção 2: Via pg_dump Direto

### Passo 1: Obter String de Conexão
1. Acesse Supabase Dashboard
2. Settings → Database
3. Copie a "Connection string" (modo Direct)

Exemplo:
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Passo 2: Executar pg_dump
```bash
# Se você tem PostgreSQL instalado localmente
pg_dump "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" > supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

**Nota:** Substitua `[PROJECT_REF]` e `[PASSWORD]` pelos valores reais.

---

## Opção 3: Backup Manual via SQL (Emergência)

Se as opções acima não funcionarem, você pode executar queries SQL manualmente:

### No Supabase SQL Editor:

```sql
-- 1. Backup de Dados (Execute para cada tabela)
COPY (SELECT * FROM tenants) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM instrutores) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM cursos) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM materias) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM aulas) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM eventos) TO STDOUT WITH CSV HEADER;

-- 2. Backup de Estrutura
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. Backup de Policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public';

-- 4. Backup de Funções
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public';
```

Salve os resultados em arquivos separados.

---

## ✅ Validar Backup

Após gerar o dump, valide:

```bash
# Verificar tamanho do arquivo
ls -lh supabase/backups/supabase_dump_recoverypoint_20260124.sql

# Verificar conteúdo (primeiras 100 linhas)
head -n 100 supabase/backups/supabase_dump_recoverypoint_20260124.sql

# Contar tabelas no dump
grep -c "CREATE TABLE" supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

Deve mostrar pelo menos 7-8 tabelas.

---

## 🔄 Restaurar Backup (Quando Necessário)

```bash
# Via Supabase CLI
supabase db reset
supabase db push

# Ou via psql
psql "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" < supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

---

## 📝 Alternativa Simples: Export Manual

Se tudo falhar, você pode fazer export manual via Supabase Dashboard:

1. Database → Tables
2. Para cada tabela: clique → Export → CSV
3. Salve todos os CSVs em `supabase/backups/manual_export_20260124/`

**Tabelas principais para exportar:**
- tenants
- users
- instrutores
- cursos
- materias
- aulas
- eventos
- audit_logs

---

## ✅ Após Completar o Backup

Atualize o `CHECKLIST_RECOVERY_20260124.md`:
- [x] Backup do banco de dados criado
- [x] Arquivo SQL gerado e validado
- [x] Recovery point 100% completo

**Sistema estará totalmente protegido!** 🔒
