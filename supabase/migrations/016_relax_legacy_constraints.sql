-- ============================================================
-- MIGRATION 016: Relax Legacy Constraints for Coexistence
-- Purpose: Allow new automated classes to be created without 
--          relying on legacy `curso_id` and `materia_id` FKs.
--          This enables the coexistence of the old manual flow
--          with the new `turma_id` / `disciplina_id` automated flow.
-- ============================================================

ALTER TABLE public.aulas ALTER COLUMN curso_id DROP NOT NULL;
ALTER TABLE public.aulas ALTER COLUMN materia_id DROP NOT NULL;

-- Remove the legacy NOT NULL constraints from instrutor_id if present (since turmas can be created without instructor upfront and assigned later)
ALTER TABLE public.aulas ALTER COLUMN instrutor_id DROP NOT NULL;

-- Add text columns to store snapshots from Catalog (avoids FK violations while keeping visual identity)
ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS nome_curso TEXT;
ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS nome_materia TEXT;
ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS nome_instrutor TEXT;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
