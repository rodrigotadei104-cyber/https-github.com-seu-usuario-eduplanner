
-- View: Auditoria de Integridade de Aulas
-- Objetivo: Centralizar regras de auditoria para identificar inconsistências

CREATE OR REPLACE VIEW public.auditoria_integridade_aulas AS
WITH issues AS (
    -- 1. Aulas sem instrutor
    SELECT 
        id AS aula_id,
        'SEM_INSTRUTOR' AS tipo_problema,
        'CRITICA' AS gravidade,
        'Aula sem instrutor atribuído' AS detalhes
    FROM public.aulas
    WHERE instrutor_id IS NULL
    
    UNION ALL

    -- 2. Aulas sem matéria
    SELECT 
        id,
        'SEM_MATERIA',
        'CRITICA',
        'Aula sem matéria atribuída'
    FROM public.aulas
    WHERE materia_id IS NULL

    UNION ALL

    -- 3. Aulas concluídas incompletas (sem instrutor ou matéria)
    SELECT 
        id,
        'CONCLUIDA_INCOMPLETA',
        'ALTA',
        'Status concluída mas dados incompletos'
    FROM public.aulas
    WHERE status = 'concluida' AND (instrutor_id IS NULL OR materia_id IS NULL)

    UNION ALL

    -- 4. Duração menor que 30 minutos
    SELECT 
        id,
        'DURACAO_CURTA',
        'MEDIA',
        'Duração inferior a 30 minutos'
    FROM public.aulas
    WHERE horario_fim - horario_inicio < '00:30:00'

    UNION ALL

    -- 5. Referências Órfãs (Instrutor)
    SELECT 
        a.id,
        'ORFAO_INSTRUTOR',
        'CRITICA',
        'Instrutor ID não existe na tabela instrutores'
    FROM public.aulas a
    LEFT JOIN public.instrutores i ON a.instrutor_id = i.id
    WHERE a.instrutor_id IS NOT NULL AND i.id IS NULL

    UNION ALL

    -- 6. Referências Órfãs (Matéria)
    SELECT 
        a.id,
        'ORFAO_MATERIA',
        'CRITICA',
        'Matéria ID não existe na tabela materias'
    FROM public.aulas a
    LEFT JOIN public.materias m ON a.materia_id = m.id
    WHERE a.materia_id IS NOT NULL AND m.id IS NULL

    UNION ALL

    -- 7. Futuras Concluídas
    SELECT 
        id,
        'FUTURO_CONCLUIDO',
        'ALTA',
        'Aula futura marcada como concluída'
    FROM public.aulas
    WHERE data > CURRENT_DATE AND status = 'concluida'

    UNION ALL

    -- 8. Passadas Agendadas
    SELECT 
        id,
        'PASSADO_PENDENTE',
        'BAIXA',
        'Aula passada ainda como agendada'
    FROM public.aulas
    WHERE data < CURRENT_DATE AND status = 'agendada'
)
SELECT 
    i.aula_id,
    a.data,
    a.horario_inicio,
    a.status,
    i.tipo_problema,
    i.gravidade,
    i.detalhes
FROM issues i
JOIN public.aulas a ON i.aula_id = a.id;
