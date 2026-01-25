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
