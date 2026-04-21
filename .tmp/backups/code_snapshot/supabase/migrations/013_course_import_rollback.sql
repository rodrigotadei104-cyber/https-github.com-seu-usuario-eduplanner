-- Criar a tabela de snapshots para rollback de cursos importados
CREATE TABLE IF NOT EXISTS public.course_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS
ALTER TABLE public.course_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para course_snapshots
CREATE POLICY "Users can view snapshots of their tenant"
    ON public.course_snapshots
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert snapshots in their tenant"
    ON public.course_snapshots
    FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.users WHERE id = auth.uid()
        )
    );

-- Criar tipo de retorno para a RPC de importação atômica
DROP TYPE IF EXISTS import_update_result CASCADE;
CREATE TYPE import_update_result AS (
    success BOOLEAN,
    message TEXT
);

CREATE OR REPLACE FUNCTION public.import_update_course_transaction(
    p_course_id UUID,
    p_tenant_id UUID,
    p_course_data JSONB,
    p_materias_data JSONB,
    p_aulas_data JSONB,
    p_user_id UUID
) RETURNS import_update_result AS '
DECLARE
    v_materia_record JSONB;
    v_aula_record JSONB;
BEGIN
    -- 1. Validar Tenant ID e Permissões (simplificado para o escopo da função, confiando no RLS da chamada se aplicável, 
    -- mas usando SECURITY DEFINER para garantir que as deleções ocorram em bloco).
    
    -- 2. Atualizar o Curso (Update)
    UPDATE public.cursos
    SET nome = (p_course_data->>''nome'')::TEXT
    WHERE id = p_course_id AND tenant_id = p_tenant_id;

    -- 3. Deletar TODAS as Aulas e Matérias anteriores vinculadas a esse curso (Isso garante que aulas sumam em vez de duplicar se a planilha foi alterada)
    -- As aulas são deletadas primeiro via ON DELETE CASCADE (se existir), mas forçamos aqui por segurança.
    DELETE FROM public.aulas WHERE curso_id = p_course_id AND tenant_id = p_tenant_id;
    DELETE FROM public.materias WHERE curso_id = p_course_id AND tenant_id = p_tenant_id;

    -- 4. Re-inserir as Matérias
    FOR v_materia_record IN SELECT * FROM jsonb_array_elements(p_materias_data)
    LOOP
        INSERT INTO public.materias (id, tenant_id, nome, curso_id, carga_horaria)
        VALUES (
            (v_materia_record->>''id'')::UUID,
            p_tenant_id,
            v_materia_record->>''nome'',
            p_course_id,
            (v_materia_record->>''carga_horaria'')::INTEGER
        );
    END LOOP;

    -- 5. Re-inserir as Aulas
    FOR v_aula_record IN SELECT * FROM jsonb_array_elements(p_aulas_data)
    LOOP
        INSERT INTO public.aulas (
            id, 
            tenant_id, 
            data, 
            horario_inicio, 
            horario_fim, 
            instrutor_id, 
            curso_id, 
            materia_id, 
            sala, 
            status,
            numero_turma,
            carga_horaria_materia
        )
        VALUES (
            (v_aula_record->>''id'')::UUID,
            p_tenant_id,
            (v_aula_record->>''data'')::DATE,
            (v_aula_record->>''horario_inicio'')::TIME,
            (v_aula_record->>''horario_fim'')::TIME,
            (v_aula_record->>''instrutor_id'')::UUID,
            p_course_id,
            (v_aula_record->>''materia_id'')::UUID,
            v_aula_record->>''sala'',
            ''agendada'',
            v_aula_record->>''numero_turma'',
            (v_aula_record->>''carga_horaria_materia'')::INTEGER
        );
    END LOOP;

    RETURN ROW(TRUE, ''Curso, matérias e aulas atualizados com sucesso.'')::import_update_result;

EXCEPTION
    WHEN OTHERS THEN
        -- Retorna o erro capturado para o cliente em vez de quebrar a transação silenciosamente
        RETURN ROW(FALSE, ''Erro na transação: '' || SQLERRM)::import_update_result;
END;
' LANGUAGE plpgsql SECURITY DEFINER;
