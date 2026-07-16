-- Migration 020: Adicionar flag aula_extra à tabela aulas
-- Permite que aulas sejam marcadas como adicionais e ignorem limites de carga horária

ALTER TABLE aulas ADD COLUMN IF NOT EXISTS aula_extra BOOLEAN DEFAULT FALSE;
