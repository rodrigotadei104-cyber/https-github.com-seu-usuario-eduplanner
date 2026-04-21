-- Migration: Prevent Unassigned Active/Completed Classes
-- Date: 2026-02-13
-- Author: EduPlanner AI

-- 1. Add CHECK constraint to ensure 'em_andamento' and 'concluida' classes have an instructor
DO $$ 
BEGIN
    ALTER TABLE public.aulas
    ADD CONSTRAINT check_instrutor_required_for_active_classes
    CHECK (
        NOT (
            status IN ('em_andamento', 'concluida') 
            AND instrutor_id IS NULL
        )
    );
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Constraint check_instrutor_required_for_active_classes already exists.';
END $$;
