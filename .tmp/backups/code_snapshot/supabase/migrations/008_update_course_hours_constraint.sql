-- Remove the old constraint that restricted values to 50 or 60
ALTER TABLE cursos 
DROP CONSTRAINT IF EXISTS check_valid_minutes;

-- Add new constraint allowing any value >= 30 minutes
ALTER TABLE cursos
ADD CONSTRAINT check_valid_minutes CHECK (minutos_por_hora >= 30);

-- Update column comment to reflect the change
COMMENT ON COLUMN cursos.minutos_por_hora IS 'Duração da hora-aula em minutos. Deve ser maior ou igual a 30.';
