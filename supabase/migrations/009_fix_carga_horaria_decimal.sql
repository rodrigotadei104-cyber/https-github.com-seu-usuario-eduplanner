-- ============================================
-- Migration: Fix carga_horaria_materia column type
-- Date: 2026-02-12
-- 
-- Problem: Column "carga_horaria_materia" in public.aulas 
--          is INTEGER but receives computed decimal values 
--          (e.g. 3.33 = 200min / 60min-per-hour).
--          Error: "invalid input syntax for type integer: 3.33"
--
-- Fix: ALTER COLUMN type from INTEGER to NUMERIC(10,2)
-- ============================================

ALTER TABLE public.aulas 
ALTER COLUMN carga_horaria_materia TYPE NUMERIC(10,2);

COMMENT ON COLUMN public.aulas.carga_horaria_materia IS 'Carga horária da matéria em horas/aula (suporta valores decimais, ex: 3.33)';
