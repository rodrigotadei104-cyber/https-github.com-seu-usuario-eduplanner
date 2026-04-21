-- ============================================================
-- MIGRATION 017: Datas Bloqueadas por Turma
-- Purpose: Adicionar campo para exceções de agenda específicas por turma.
-- Format: Array JSONB de strings ISO DATE (YYYY-MM-DD)
-- ============================================================

ALTER TABLE public.turmas 
ADD COLUMN IF NOT EXISTS datas_bloqueadas JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.turmas.datas_bloqueadas IS 'Lista de datas (YYYY-MM-DD) que o motor de agenda deve ignorar para esta turma especificamente.';

-- Garantir que o default seja um array vazio para novas turmas
UPDATE public.turmas SET datas_bloqueadas = '[]'::jsonb WHERE datas_bloqueadas IS NULL;
