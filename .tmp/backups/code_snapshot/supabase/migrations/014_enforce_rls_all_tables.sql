-- ============================================================
-- MIGRATION 014: Enforce RLS on all public tables
-- Purpose: Fix Supabase Security Advisor errors reported on
--          2026-03-01 for project eduplanner-prod.
--          All 6 affected tables were missing RLS enforcement.
--          This migration is IDEMPOTENT and safe to re-run.
-- Tables affected: tenants, users, instrutores, cursos,
--                  materias, aulas
-- ============================================================

-- ─── PASSO 1: Garantir que a função auxiliar existe ─────────
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

-- ─── PASSO 2: Forçar RLS em todas as tabelas ────────────────
ALTER TABLE public.tenants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrutores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas      ENABLE ROW LEVEL SECURITY;

-- Garantir que o RLS seja forçado mesmo para o dono da tabela
ALTER TABLE public.tenants    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.instrutores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cursos     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.materias   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.aulas      FORCE ROW LEVEL SECURITY;

-- ─── PASSO 3: Recriar políticas de forma idempotente ────────

-- TENANTS: Usuário só vê o próprio tenant
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
CREATE POLICY "Users can view own tenant"
    ON public.tenants
    FOR SELECT
    USING (id = public.get_current_tenant_id());

-- USERS: Isolamento total por tenant
DROP POLICY IF EXISTS "Tenant isolation for users" ON public.users;
CREATE POLICY "Tenant isolation for users"
    ON public.users
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- INSTRUTORES: Isolamento total por tenant
DROP POLICY IF EXISTS "Tenant isolation for instrutores" ON public.instrutores;
CREATE POLICY "Tenant isolation for instrutores"
    ON public.instrutores
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- CURSOS: Isolamento total por tenant
DROP POLICY IF EXISTS "Tenant isolation for cursos" ON public.cursos;
CREATE POLICY "Tenant isolation for cursos"
    ON public.cursos
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- MATERIAS: Isolamento total por tenant
DROP POLICY IF EXISTS "Tenant isolation for materias" ON public.materias;
CREATE POLICY "Tenant isolation for materias"
    ON public.materias
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- AULAS: Isolamento total por tenant
DROP POLICY IF EXISTS "Tenant isolation for aulas" ON public.aulas;
CREATE POLICY "Tenant isolation for aulas"
    ON public.aulas
    FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- ─── PASSO 4: Verificação final ─────────────────────────────
-- Comentário: Após executar esta migration, os 6 erros reportados
-- pelo Supabase Security Advisor devem desaparecer.
-- Para confirmar, acesse: Dashboard > Security Advisor > Refresh
-- ============================================================
