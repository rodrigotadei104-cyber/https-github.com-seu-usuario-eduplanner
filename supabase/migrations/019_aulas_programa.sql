ALTER TABLE aulas ADD COLUMN IF NOT EXISTS tipo_aula TEXT DEFAULT 'NORMAL';
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS origem TEXT;
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS contabiliza_carga BOOLEAN DEFAULT true;

UPDATE aulas SET tipo_aula = 'NORMAL' WHERE tipo_aula IS NULL;

ALTER TABLE aulas ALTER COLUMN materia_id DROP NOT NULL;
ALTER TABLE aulas ALTER COLUMN curso_id DROP NOT NULL;

ALTER TABLE aulas DROP CONSTRAINT IF EXISTS check_aula_tipo_integridade;

ALTER TABLE aulas ADD CONSTRAINT check_aula_tipo_integridade
CHECK ( (tipo_aula = 'PROGRAMA' AND origem IS NOT NULL) OR (tipo_aula = 'NORMAL') );

CREATE INDEX IF NOT EXISTS idx_aulas_tipo_programa ON aulas(tipo_aula) WHERE tipo_aula = 'PROGRAMA';
