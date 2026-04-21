-- ============================================================
-- ROLLBACK MIGRATION 018: Desfazendo Hardening do Banco
-- Purpose: Remove constraints, indices and the added audit log table.
-- ============================================================

-- 1. REMOVER CONSTRAINTS DE UNICIDADE
DROP INDEX IF EXISTS public.unique_turma_data_horario;
DROP INDEX IF EXISTS public.unique_sala_data_horario;
DROP INDEX IF EXISTS public.unique_instrutor_data_horario;

-- 2. REMOVER ÍNDICE DE PERFORMANCE
DROP INDEX IF EXISTS public.idx_aulas_turma_data;

-- 3. REMOVER COLUNA DE AUDITORIA
ALTER TABLE public.aulas DROP COLUMN IF EXISTS updated_at;

-- 4. REMOVER TABELA DE LOGS
DROP TABLE IF EXISTS public.log_operacoes_agenda CASCADE;

-- ============================================================
-- FIM DO ROLLBACK 018
-- ============================================================
