# 🔒 Recovery Point - EduPlanner
**Data de Criação:** 24 de Janeiro de 2026  
**Motivo:** Ponto de recuperação antes da implementação do módulo de IA para geração de cronograma

---

## 📦 Informações de Versão

### Frontend
- **Versão:** 1.0.0
- **Framework:** React 19.2.3 + TypeScript 5.8.2
- **Build Tool:** Vite 6.2.0
- **Deploy:** Vercel (Production)

### Dependências Principais
```json
{
  "@supabase/supabase-js": "2.39.3",
  "date-fns": "4.1.0",
  "lucide-react": "0.562.0",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "recharts": "3.6.0",
  "xlsx": "0.18.5"
}
```

### Backend
- **Banco de Dados:** Supabase (PostgreSQL)
- **Autenticação:** Supabase Auth
- **Storage:** Supabase Storage
- **Edge Functions:** Supabase Functions

---

## 🗄️ Estado do Banco de Dados

### Migrations Aplicadas (6 total)

1. **001_complete_schema.sql**
   - Schema completo inicial
   - Tabelas: users, tenants, instrutores, cursos, materias, aulas
   - RLS policies básicas
   - Triggers de auditoria

2. **002_add_avatar_support.sql**
   - Suporte a avatares de usuário
   - Campo `avatar_url` na tabela users

3. **003_add_course_hours_config.sql**
   - Configuração de minutos por hora/aula
   - Campo `minutos_por_hora` na tabela cursos

4. **004_create_events_table.sql**
   - Tabela de eventos do calendário
   - Suporte a eventos personalizados

5. **005_add_course_number.sql**
   - Número de curso (identificador de turma)
   - Campo `numero_curso` na tabela cursos

6. **006_add_subject_workload.sql**
   - Carga horária por matéria
   - Campo `carga_horaria_materia` na tabela aulas
   - **CRÍTICO:** Métrica principal do Dashboard

### Estrutura de Tabelas Principais

#### `tenants`
- Sistema multi-tenant ativo
- Isolamento por RLS

#### `users`
- Roles: admin, manager, instructor, viewer
- Autenticação via Supabase Auth
- Avatar support

#### `cursos`
- Carga horária total
- Minutos por hora/aula (50 ou 60)
- Número de curso (turma)
- Cores personalizadas

#### `materias`
- Vinculadas a cursos
- Carga horária individual

#### `aulas`
- Status: agendada, em_andamento, concluida, cancelada
- **Carga horária da matéria** (campo crítico)
- Horários de início e fim
- Sala, observações

#### `eventos`
- Eventos personalizados do calendário
- Tipos: feriado, reuniao, evento

---

## 🔐 Políticas RLS Vigentes

### Tenant Isolation
- Todas as tabelas principais têm RLS habilitado
- Políticas filtram por `tenant_id`
- Função helper: `auth.get_tenant_id()`

### Permissões por Role
- **Admin:** Acesso total ao tenant
- **Manager:** Gerenciamento de aulas e cadastros
- **Instructor:** Visualização e edição de próprias aulas
- **Viewer:** Apenas leitura

---

## ⚙️ Funções SQL Ativas

### `auth.get_tenant_id()`
- Retorna tenant_id do usuário autenticado
- Usada em todas as policies RLS

### `public.sync_class_statuses()`
- Sincroniza status das aulas automaticamente
- Atualiza: agendada → em_andamento → concluida
- Executada via trigger ou chamada manual

### Triggers
- Auditoria automática em todas as tabelas principais
- Log de alterações na tabela `audit_logs`

---

## 🎯 Features Implementadas

### Dashboard
- ✅ Total de Horas/Aula (métrica baseada em carga_horaria_materia)
- ✅ Horas Lecionadas (calculadas)
- ✅ Instrutores Ativos
- ✅ Taxa de Conclusão
- ✅ Status das Aulas (por horas/aula)
- ✅ Distribuição Anual (por horas/aula)
- ✅ Hora/aula por Instrutor
- ✅ Comparativo Mensal de Instrutores
- ✅ Tendência de Crescimento
- ✅ Projeção Anual
- ✅ Turmas Abertas no Mês Atual

### Gestão de Aulas
- ✅ CRUD completo
- ✅ Validação de conflitos (instrutor e sala)
- ✅ Sincronização automática de status
- ✅ Importação via Excel
- ✅ Exportação para Excel

### Gestão Acadêmica
- ✅ Cadastro de Instrutores
- ✅ Cadastro de Cursos (com número de turma)
- ✅ Cadastro de Matérias

### Sistema de Usuários
- ✅ Multi-tenant completo
- ✅ Convites por email
- ✅ Gestão de permissões (4 roles)
- ✅ Avatar support
- ✅ Reset de senha seguro

### Calendário
- ✅ Visualização Mensal
- ✅ Visualização Diária
- ✅ Eventos personalizados
- ✅ Filtros por status, instrutor, curso

---

## 📊 Métricas Críticas

### Critério de Horas/Aula
**IMPORTANTE:** Todo o Dashboard foi convertido para usar `carga_horaria_materia` ao invés de contar eventos.

- Cada aula tem uma carga horária definida (ex: 10 horas/aula)
- Todos os gráficos somam horas/aula, não contam eventos
- Importação via Excel mapeia coluna "Carga Matéria"

### Campos Críticos
- `aulas.carga_horaria_materia` - Métrica principal
- `cursos.numero_curso` - Identificador de turma
- `cursos.minutos_por_hora` - Configuração de hora/aula

---

## 🔄 Instruções de Rollback

### 1. Restaurar Banco de Dados

#### Via Supabase Dashboard
1. Acessar Supabase Dashboard → Database → Backups
2. Localizar backup: `eduplanner-recoverypoint-before-AI-scheduler-2026-01-24`
3. Clicar em "Restore"
4. Confirmar restauração

#### Via SQL Dump (se necessário)
```bash
# Restaurar dump técnico
psql -h db.PROJECT_REF.supabase.co -U postgres -d postgres < supabase/backups/supabase_dump_recoverypoint_20260124.sql
```

### 2. Reverter Código

```bash
# Voltar para tag de recovery
git checkout v1.0-recovery-point-20260124

# Ou reverter para commit específico
git reset --hard <COMMIT_HASH>

# Reinstalar dependências
npm install

# Rebuild
npm run build
```

### 3. Reverter Deployment Vercel

#### Opção 1: Via Dashboard
1. Acessar Vercel Dashboard
2. Ir em Deployments
3. Localizar deployment de 24/01/2026
4. Clicar em "..." → "Promote to Production"

#### Opção 2: Via Alias
```bash
# Se alias foi criado
vercel alias set eduplanner-stable-20260124.vercel.app eduplanner-alpha.vercel.app
```

### 4. Restaurar Storage (se aplicável)

```bash
# Descompactar backup
unzip storage_backup_20260124.zip

# Fazer upload manual via Supabase Dashboard
# Storage → Upload files
```

---

## ✅ Checklist de Integridade

### Pré-Rollback
- [ ] Confirmar que backup do Supabase existe
- [ ] Verificar que tag git foi criada
- [ ] Confirmar deployment Vercel está acessível
- [ ] Validar dump SQL está íntegro

### Durante Rollback
- [ ] Fazer backup do estado atual antes de reverter
- [ ] Restaurar banco de dados
- [ ] Reverter código
- [ ] Reverter deployment
- [ ] Restaurar storage (se necessário)

### Pós-Rollback
- [ ] Testar login
- [ ] Verificar Dashboard
- [ ] Testar CRUD de aulas
- [ ] Validar importação Excel
- [ ] Confirmar multi-tenant funcionando

---

## 📝 Notas Adicionais

### Configurações Importantes

**Supabase:**
- RLS habilitado em todas as tabelas
- Auditoria ativa
- Backup automático diário (além deste manual)

**Vercel:**
- Auto-deploy no push para main
- Environment variables configuradas
- Build command: `npm run build`

### Contatos de Emergência
- Supabase Support: support@supabase.io
- Vercel Support: support@vercel.com

---

## 🎯 Próximos Passos (Pós-Recovery Point)

Após este ponto de recuperação, será implementado:
- **Módulo de IA para Geração de Cronograma**
- Integração com LLM para sugestão automática de horários
- Otimização de distribuição de aulas
- Detecção inteligente de conflitos

**IMPORTANTE:** Qualquer problema na implementação da IA, usar este recovery point para voltar ao estado estável.

---

**Documento gerado automaticamente em:** 2026-01-24 21:33 BRT  
**Versão do Sistema:** 1.0.0  
**Status:** ✅ Sistema Estável e Pronto para Backup
