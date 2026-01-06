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
