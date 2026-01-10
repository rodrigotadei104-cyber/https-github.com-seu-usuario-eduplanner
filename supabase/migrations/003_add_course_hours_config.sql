-- Add configurable legal hours column to courses (table: cursos)
-- Default is 60 minutes (standard), allow 50 minutes as alternative.

ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS minutos_por_hora INTEGER NOT NULL DEFAULT 60;

-- Add check constraint to ensure only valid values (50 or 60)
ALTER TABLE cursos
ADD CONSTRAINT check_valid_minutes CHECK (minutos_por_hora IN (50, 60));

-- Comment for documentation
COMMENT ON COLUMN cursos.minutos_por_hora IS 'Define se a hora-aula legal do curso é de 60 minutos (padrão) ou 50 minutos.';
