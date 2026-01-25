-- ============================================
-- Add carga_horaria_materia column to aulas table
-- This stores the subject's workload in hours/class
-- ============================================

ALTER TABLE public.aulas 
ADD COLUMN IF NOT EXISTS carga_horaria_materia INTEGER;

COMMENT ON COLUMN public.aulas.carga_horaria_materia IS 'Carga horária da matéria em horas/aula';
