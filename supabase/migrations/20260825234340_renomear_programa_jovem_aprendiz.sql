-- Renomeia uma coluna do Jovem Aprendiz e todas as aulas vinculadas em uma
-- unica transacao. SECURITY INVOKER mantem RLS ativo para o usuario chamador.
CREATE OR REPLACE FUNCTION public.renomear_jovem_aprendiz_programa(
    p_programa_id UUID,
    p_novo_nome TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_tenant_id UUID;
    v_nome_anterior TEXT;
    v_novo_nome TEXT := btrim(p_novo_nome);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
    END IF;

    IF v_novo_nome IS NULL OR length(v_novo_nome) = 0 THEN
        RAISE EXCEPTION 'O título da coluna não pode ficar vazio.' USING ERRCODE = '22023';
    END IF;

    SELECT p.tenant_id, p.nome
      INTO v_tenant_id, v_nome_anterior
      FROM public.jovem_aprendiz_programas p
     WHERE p.id = p_programa_id
       AND p.ativo = true
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Coluna não encontrada ou sem acesso.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.users u
         WHERE u.id = v_user_id
           AND u.tenant_id = v_tenant_id
           AND u.role IN ('admin', 'editor')
           AND u.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Apenas administradores e editores podem renomear colunas.' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.jovem_aprendiz_programas p
         WHERE p.tenant_id = v_tenant_id
           AND p.nome = v_novo_nome
           AND p.id <> p_programa_id
    ) THEN
        RAISE EXCEPTION 'Já existe uma coluna com esse título.' USING ERRCODE = '23505';
    END IF;

    IF v_novo_nome = v_nome_anterior THEN
        RETURN;
    END IF;

    UPDATE public.jovem_aprendiz_programas
       SET nome = v_novo_nome,
           atualizado_por = v_user_id,
           updated_at = now()
     WHERE id = p_programa_id
       AND tenant_id = v_tenant_id;

    UPDATE public.aulas
       SET origem = v_novo_nome
     WHERE tenant_id = v_tenant_id
       AND tipo_aula = 'PROGRAMA'
       AND origem = v_nome_anterior;
END;
$$;

REVOKE ALL ON FUNCTION public.renomear_jovem_aprendiz_programa(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renomear_jovem_aprendiz_programa(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.renomear_jovem_aprendiz_programa(UUID, TEXT) TO authenticated;
