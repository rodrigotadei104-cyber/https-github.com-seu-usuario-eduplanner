-- Migration: Add carga_horaria (Total Workload) to Materias table
-- Date: 2026-01-24

-- 1. Add column 'carga_horaria' to 'materias' table
-- This represents the TARGET workload for the subject (e.g., 10 hours)
ALTER TABLE public.materias 
ADD COLUMN IF NOT EXISTS carga_horaria INTEGER;

COMMENT ON COLUMN public.materias.carga_horaria IS 'Carga horária total da matéria (meta) em horas';
