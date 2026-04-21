-- ============================================================
-- MIGRATION 015: Nova Arquitetura Institucional (Gerador de Agendas)
-- Purpose: Create tables for Catalog, Classes, Holidays and Blocked Dates
--          Update existing `aulas` table for the auto-generation engine.
--          Apply strict multi-tenant RLS for every new table.
-- ============================================================

-- ==========================================
-- 1. TIPOS ENUM
-- ==========================================
DO $$ BEGIN
    CREATE TYPE public.disciplina_tipo AS ENUM ('teorica', 'pratica', 'hibrida', 'outros');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.turma_status AS ENUM ('planejada', 'em_andamento', 'concluida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.feriado_tipo AS ENUM ('nacional', 'estadual', 'municipal', 'institucional');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.bloqueio_tipo AS ENUM ('institucional', 'sala', 'instrutor', 'curso');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==========================================
-- 2. CATÁLOGO DE CURSOS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.catalogo_cursos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome_curso TEXT NOT NULL,
    carga_total_horas INTEGER NOT NULL,
    tipo_hora_min TEXT, -- Ex: "60", "50"
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_cursos_tenant ON public.catalogo_cursos(tenant_id);

CREATE TABLE IF NOT EXISTS public.disciplinas_curso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    curso_id UUID NOT NULL REFERENCES public.catalogo_cursos(id) ON DELETE CASCADE,
    nome_disciplina TEXT NOT NULL,
    carga_horas INTEGER NOT NULL,
    tipo_disciplina public.disciplina_tipo DEFAULT 'teorica',
    ordem INTEGER, -- nullable
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disciplinas_curso_tenant ON public.disciplinas_curso(tenant_id);
CREATE INDEX IF NOT EXISTS idx_disciplinas_curso_curso ON public.disciplinas_curso(curso_id);

-- ==========================================
-- 3. GESTÃO DE TURMAS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.turmas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    numero_turma TEXT NOT NULL,
    curso_id UUID NOT NULL REFERENCES public.catalogo_cursos(id),
    instrutor_id UUID REFERENCES public.instrutores(id),
    sala_padrao TEXT,
    data_inicio DATE NOT NULL,
    dias_semana_selecionados INTEGER[] NOT NULL, -- Ex: [1, 3] para Seg, Qua
    horarios_do_dia JSONB NOT NULL, -- Ex: [{"inicio": "08:00", "fim": "12:00"}]
    status public.turma_status DEFAULT 'planejada',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turmas_tenant ON public.turmas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_turmas_curso ON public.turmas(curso_id);

-- ==========================================
-- 4. CALENDÁRIO INSTITUCIONAL
-- ==========================================
CREATE TABLE IF NOT EXISTS public.feriados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    descricao TEXT NOT NULL,
    tipo public.feriado_tipo DEFAULT 'nacional',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feriados_tenant_data ON public.feriados(tenant_id, data);

CREATE TABLE IF NOT EXISTS public.datas_bloqueadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    motivo TEXT NOT NULL,
    tipo public.bloqueio_tipo DEFAULT 'institucional',
    criado_por UUID REFERENCES public.users(id),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_tenant_data ON public.datas_bloqueadas(tenant_id, data);

-- ==========================================
-- 5. ATUALIZAÇÃO DA TABELA DE AULAS
-- ==========================================
ALTER TABLE public.aulas 
ADD COLUMN IF NOT EXISTS disciplina_id UUID REFERENCES public.disciplinas_curso(id),
ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES public.turmas(id),
ADD COLUMN IF NOT EXISTS auto_gerada BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_aulas_turma ON public.aulas(turma_id);

-- ==========================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE public.catalogo_cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_cursos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.disciplinas_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinas_curso FORCE ROW LEVEL SECURITY;

ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados FORCE ROW LEVEL SECURITY;

ALTER TABLE public.datas_bloqueadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datas_bloqueadas FORCE ROW LEVEL SECURITY;

-- POLÍTICAS: CATÁLOGO DE CURSOS
DROP POLICY IF EXISTS "Tenant isolation for catalogo_cursos" ON public.catalogo_cursos;
CREATE POLICY "Tenant isolation for catalogo_cursos"
    ON public.catalogo_cursos FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: DISCIPLINAS CURSO
DROP POLICY IF EXISTS "Tenant isolation for disciplinas_curso" ON public.disciplinas_curso;
CREATE POLICY "Tenant isolation for disciplinas_curso"
    ON public.disciplinas_curso FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: TURMAS
DROP POLICY IF EXISTS "Tenant isolation for turmas" ON public.turmas;
CREATE POLICY "Tenant isolation for turmas"
    ON public.turmas FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: FERIADOS
DROP POLICY IF EXISTS "Tenant isolation for feriados" ON public.feriados;
CREATE POLICY "Tenant isolation for feriados"
    ON public.feriados FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- POLÍTICAS: DATAS BLOQUEADAS
DROP POLICY IF EXISTS "Tenant isolation for datas_bloqueadas" ON public.datas_bloqueadas;
CREATE POLICY "Tenant isolation for datas_bloqueadas"
    ON public.datas_bloqueadas FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
