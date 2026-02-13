
-- 011_add_integrity_constraints.sql
-- Goal: Prevent future data integrity issues (ghost classes, incomplete status)

-- 1. Constraint: Cannot be 'concluida' if instructor or materia is missing
ALTER TABLE public.aulas
ADD CONSTRAINT check_aula_concluida_completa
CHECK (
    status != 'concluida' 
    OR (instrutor_id IS NOT NULL AND materia_id IS NOT NULL)
);

-- 2. Constraint: Prevent overlap for same instructor (Optional validation logic, but let's add basic unique constraint if safe?)
-- A strictly unique index on (instrutor_id, data, horario_inicio) would prevent double booking.
-- However, we must ensure 'instrutor_id' is not null for this index to work effectively or use partial index.
-- Since we allow null instructor_id for drafts, we only enforce if instrutor_id is set.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_instrutor_horario
ON public.aulas (instrutor_id, data, horario_inicio)
WHERE instrutor_id IS NOT NULL AND status != 'cancelada';

-- 3. Comment explaining the changes
COMMENT ON CONSTRAINT check_aula_concluida_completa ON public.aulas IS 'Ensures completed classes have instructor and subject assigned';
