-- ============================================================
-- MIGRATION 018: Hardening do Banco de Dados (Regeneração Segura)
-- Purpose: Add audit columns, performance indices and unique constraints.
-- ============================================================

-- 1. ADIÇÃO DE COLUNAS DE AUDITORIA
ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. ÍNDICES DE PERFORMANCE
-- Busca rápida por aulas de uma turma em uma data específica
CREATE INDEX IF NOT EXISTS idx_aulas_turma_data ON public.aulas (turma_id, data);

-- 3. REGRAS DE UNICIDADE (HARDENING)
-- Estas regras impedem duplicidade em caso de erro no motor ou concorrência.
-- Ignoramos aulas 'cancelada' para permitir reagendamento no mesmo horário.

-- Turma + Data + Horário
CREATE UNIQUE INDEX IF NOT EXISTS unique_turma_data_horario 
ON public.aulas (turma_id, data, horario_inicio) 
WHERE status != 'cancelada';

-- Sala + Data + Horário (Regra de Conflito de Sala)
CREATE UNIQUE INDEX IF NOT EXISTS unique_sala_data_horario 
ON public.aulas (sala, data, horario_inicio) 
WHERE sala IS NOT NULL AND status != 'cancelada';

-- Instrutor + Data + Horário (Regra de Conflito de Instrutor)
-- Removendo índice antigo se existir para padronizar nome conforme Fase 1.
DROP INDEX IF EXISTS idx_unique_instrutor_horario;
CREATE UNIQUE INDEX IF NOT EXISTS unique_instrutor_data_horario 
ON public.aulas (instrutor_id, data, horario_inicio) 
WHERE instrutor_id IS NOT NULL AND status != 'cancelada';

-- 4. TABELA DE LOG DE OPERAÇÕES DE AGENDA (FASE 9 Pre-req)
CREATE TABLE IF NOT EXISTS public.log_operacoes_agenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    operacao TEXT NOT NULL, -- Ex: 'REGENERACAO_AGENDA', 'EXCLUSAO_LOTE'
    aulas_removidas INTEGER DEFAULT 0,
    aulas_geradas INTEGER DEFAULT 0,
    conflitos_detectados JSONB DEFAULT '[]'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Ativar RLS na tabela de logs
ALTER TABLE public.log_operacoes_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_operacoes_agenda FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for log_operacoes_agenda" ON public.log_operacoes_agenda;
CREATE POLICY "Tenant isolation for log_operacoes_agenda"
    ON public.log_operacoes_agenda FOR ALL
    USING (tenant_id = public.get_current_tenant_id());

-- ============================================================
-- FIM DA MIGRÇÃO 018
-- ============================================================
