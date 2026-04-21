-- Migration: Add numero_turma column to aulas table
-- Description: Stores the specific cohort number for a class instance

ALTER TABLE aulas
ADD COLUMN IF NOT EXISTS numero_turma TEXT;

-- Optional: Comment on column
COMMENT ON COLUMN aulas.numero_turma IS 'Identificador específico da turma (ex: 1006-B), diferente do número do curso base.';
