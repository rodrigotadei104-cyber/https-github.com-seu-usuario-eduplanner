-- Migration: Add Class Cohort (Turma) to Aulas
-- Date: 2026-01-26

-- Add column 'numero_turma' to 'aulas' table
-- This allows multiple cohorts (turmas) to share the same course definition (curso_id)
-- but be identified separately (T01, T02, etc).

ALTER TABLE public.aulas 
ADD COLUMN IF NOT EXISTS numero_turma TEXT;

-- Index for faster filtering by cohort
CREATE INDEX IF NOT EXISTS idx_aulas_turma ON public.aulas(tenant_id, numero_turma);

COMMENT ON COLUMN public.aulas.numero_turma IS 'Identificador da turma/instância do curso (Ex: T01-2026).';
