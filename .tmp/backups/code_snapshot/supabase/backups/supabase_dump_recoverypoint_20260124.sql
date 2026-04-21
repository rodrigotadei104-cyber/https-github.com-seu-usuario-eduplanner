-- ============================================
-- EDUPLANNER - RECOVERY POINT BACKUP
-- Data: 24 de Janeiro de 2026
-- Versão: 1.0.0
-- Commit: dbab515
-- Tag: v1.0-recovery-point-20260124
-- ============================================
--
-- DESCRIÇÃO:
-- Dump completo do schema do banco de dados EduPlanner
-- Contém todas as migrations aplicadas até 24/01/2026
--
-- MIGRATIONS INCLUÍDAS:
-- 1. 001_complete_schema.sql - Schema completo inicial
-- 2. 002_add_avatar_support.sql - Suporte a avatares
-- 3. 003_add_course_hours_config.sql - Configuração de minutos/hora
-- 4. 004_create_events_table.sql - Tabela de eventos
-- 5. 005_add_course_number.sql - Número de curso (turma)
-- 6. 006_add_subject_workload.sql - Carga horária da matéria
--
-- ESTRUTURA:
-- - 9 Tabelas principais
-- - Políticas RLS completas
-- - Funções SQL e Triggers
-- - Sistema Multi-Tenant
--
-- COMO RESTAURAR:
-- 1. Via Supabase SQL Editor:
--    - Copie todo o conteúdo deste arquivo
--    - Cole no SQL Editor
--    - Execute
--
-- 2. Via psql:
--    psql -h db.PROJECT_REF.supabase.co -U postgres -d postgres < supabase_dump_recoverypoint_20260124.sql
--
-- 3. Via Supabase CLI:
--    npx supabase db reset
--    npx supabase db push
--
-- ATENÇÃO:
-- - Este dump NÃO contém dados, apenas estrutura
-- - Para backup completo com dados, use: npx supabase db dump
-- - Certifique-se de ter backup dos dados antes de restaurar
--
-- ============================================

-- ============================================
-- MIGRATE: Sistema Multi-Tenant EduPlanner
-- Arquivo de migração completo para Supabase
-- ============================================

-- 1. TABELA: TENANTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);

-- 2. TIPOS ENUM
-- ============================================
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.aula_status AS ENUM ('agendada', 'em_andamento', 'concluida', 'cancelada');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.audit_action AS ENUM (
        'LOGIN_SUCCESS',
        'LOGIN_FAIL',
        'CREATE',
        'UPDATE',
        'DELETE',
        'STATUS_CHANGE',
        'CANCEL',
        'INVITE_SENT',
        'INVITE_ACCEPTED',
        'UNAUTHORIZED_ACCESS',
        'CROSS_TENANT_ATTEMPT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.audit_result AS ENUM ('success', 'failure');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABELA: USERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'viewer',
    status public.user_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 4. TABELA: INVITATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_active 
    ON public.invitations(token) WHERE used = false;

-- 5. TABELA: AUDIT_LOGS (IMUTÁVEL)
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID REFERENCES public.users(id),
    user_email TEXT NOT NULL,
    user_role TEXT DEFAULT 'anonymous',
    action public.audit_action NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    details JSONB DEFAULT '{}',
    result public.audit_result NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs(user_id);

-- CRÍTICO: Tornar tabela IMUTÁVEL
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM anon;

-- 6. TABELA: INSTRUTORES
-- ============================================
CREATE TABLE IF NOT EXISTS public.instrutores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instrutores_tenant ON public.instrutores(tenant_id);

-- 7. TABELA: CURSOS
-- ============================================
CREATE TABLE IF NOT EXISTS public.cursos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    nome TEXT NOT NULL,
    carga_horaria INTEGER,
    cor TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cursos_tenant ON public.cursos(tenant_id);

-- 8. TABELA: MATERIAS
-- ============================================
CREATE TABLE IF NOT EXISTS public.materias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    carga_horaria INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materias_tenant ON public.materias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_materias_curso ON public.materias(curso_id);

-- 9. TABELA: AULAS
-- ============================================
CREATE TABLE IF NOT EXISTS public.aulas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    data DATE NOT NULL,
    horario_inicio TIME NOT NULL,
    horario_fim TIME NOT NULL,
    instrutor_id UUID NOT NULL REFERENCES public.instrutores(id),
    curso_id UUID NOT NULL REFERENCES public.cursos(id),
    materia_id UUID NOT NULL REFERENCES public.materias(id),
    sala TEXT,
    status public.aula_status NOT NULL DEFAULT 'agendada',
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT check_horario CHECK (horario_fim > horario_inicio)
);

CREATE INDEX IF NOT EXISTS idx_aulas_tenant ON public.aulas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aulas_data ON public.aulas(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_aulas_status ON public.aulas(tenant_id, status);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aulas_updated_at ON public.aulas;
CREATE TRIGGER aulas_updated_at
    BEFORE UPDATE ON public.aulas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 10. RLS (ROW LEVEL SECURITY)
-- ============================================

-- Função auxiliar para obter tenant do usuário atual
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT tenant_id 
        FROM public.users 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS em TODAS as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrutores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: TENANTS
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
CREATE POLICY "Users can view own tenant"
    ON public.tenants
    FOR SELECT
    USING (id = public.get_current_tenant_id());

-- POLÍTICAS: USERS
DROP POLICY IF EXISTS "Tenant isolation for users" ON public.users;
CREATE POLICY "Tenant isolation for users"
    ON public.users
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: INVITATIONS
DROP POLICY IF EXISTS "Tenant isolation for invitations" ON public.invitations;
CREATE POLICY "Tenant isolation for invitations"
    ON public.invitations
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: AUDIT_LOGS
DROP POLICY IF EXISTS "Admins can view tenant logs" ON public.audit_logs;
CREATE POLICY "Admins can view tenant logs"
    ON public.audit_logs
    FOR SELECT
    USING (
        tenant_id = public.get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "All users can insert logs" ON public.audit_logs;
CREATE POLICY "All users can insert logs"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: INSTRUTORES
DROP POLICY IF EXISTS "Tenant isolation for instrutores" ON public.instrutores;
CREATE POLICY "Tenant isolation for instrutores"
    ON public.instrutores
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: CURSOS
DROP POLICY IF EXISTS "Tenant isolation for cursos" ON public.cursos;
CREATE POLICY "Tenant isolation for cursos"
    ON public.cursos
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: MATERIAS
DROP POLICY IF EXISTS "Tenant isolation for materias" ON public.materias;
CREATE POLICY "Tenant isolation for materias"
    ON public.materias
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: AULAS
DROP POLICY IF EXISTS "Tenant isolation for aulas" ON public.aulas;
CREATE POLICY "Tenant isolation for aulas"
    ON public.aulas
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- FIM DA MIGRAÇÃO
-- ============================================
-- 1. Create 'avatars' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Add photo_url to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- 3. Storage RLS Policies

-- Drop policies to ensure idempotency (avoid conflicts on re-run)
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "User Upload Own" ON storage.objects;
DROP POLICY IF EXISTS "User Update Own" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own" ON storage.objects;
DROP POLICY IF EXISTS "Admin All" ON storage.objects;
-- Cleanup potential old policy names
DROP POLICY IF EXISTS "Avatar images are publicly accessible to authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage any avatar" ON storage.objects;

-- Enable RLS (safe verify)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Create New Policies

-- Policy: Anyone valid (authenticated) can download avatars
CREATE POLICY "Public Read"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'avatars' );

-- Policy: Users can upload their own avatar
CREATE POLICY "User Upload Own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own avatar
CREATE POLICY "User Update Own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own avatar
CREATE POLICY "User Delete Own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can manage any avatar
CREATE POLICY "Admin All"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars' AND
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);
-- Add configurable legal hours column to courses (table: cursos)
-- Default is 60 minutes (standard), allow 50 minutes as alternative.

ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS minutos_por_hora INTEGER NOT NULL DEFAULT 60;

-- Add check constraint to ensure only valid values (50 or 60)
ALTER TABLE cursos
ADD CONSTRAINT check_valid_minutes CHECK (minutos_por_hora IN (50, 60));

-- Comment for documentation
COMMENT ON COLUMN cursos.minutos_por_hora IS 'Define se a hora-aula legal do curso é de 60 minutos (padrão) ou 50 minutos.';
-- Create Events table
create table public.events (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  name text not null,
  type text not null default 'outro', -- 'reuniao', 'treinamento', 'feedback', 'outro'
  date date not null,
  start_time time not null,
  end_time time not null,
  instructor_id uuid references public.instrutores(id),
  room text,
  status text not null default 'agendado', -- 'agendado', 'concluido', 'cancelado'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table public.events enable row level security;

create policy "Events are viewable by tenant users"
  on public.events for select
  using ( tenant_id = public.get_current_tenant_id() );

create policy "Events are insertable by tenant editors/admins"
  on public.events for insert
  with check (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );

create policy "Events are updateable by tenant editors/admins"
  on public.events for update
  using (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );

create policy "Events are deletable by tenant editors/admins"
  on public.events for delete
  using (
    tenant_id = public.get_current_tenant_id()
    and exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('admin', 'editor')
    )
  );
-- Migration: Add External Course Number & Course Status
-- Date: 2026-01-24

-- 1. Create Type for Course Status (if not exists)
DO $$ BEGIN
    CREATE TYPE public.curso_status AS ENUM ('ativo', 'concluido');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add column 'numero_curso' to 'cursos' table
-- We allow NULL initially to support existing courses (legacy compatibility)
ALTER TABLE public.cursos 
ADD COLUMN IF NOT EXISTS numero_curso TEXT;

-- 3. Add column 'status' to 'cursos' table
ALTER TABLE public.cursos 
ADD COLUMN IF NOT EXISTS status public.curso_status NOT NULL DEFAULT 'ativo';

-- 4. Add Unique Constraint per Tenant for numero_curso
ALTER TABLE public.cursos 
ADD CONSTRAINT uniq_numero_curso_tenant UNIQUE (tenant_id, numero_curso);

-- 5. Comments
COMMENT ON COLUMN public.cursos.numero_curso IS 'Identificador externo/acadêmico do curso (Ex: código MEC/ERP). Único por tenant.';
COMMENT ON COLUMN public.cursos.status IS 'Status do ciclo de vida do curso (ativo/concluido).';
-- ============================================
-- Add carga_horaria_materia column to aulas table
-- This stores the subject's workload in hours/class
-- ============================================

ALTER TABLE public.aulas 
ADD COLUMN IF NOT EXISTS carga_horaria_materia INTEGER;

COMMENT ON COLUMN public.aulas.carga_horaria_materia IS 'Carga horária da matéria em horas/aula';
