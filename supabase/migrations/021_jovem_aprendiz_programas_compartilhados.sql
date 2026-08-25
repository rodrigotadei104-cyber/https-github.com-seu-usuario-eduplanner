-- Fonte unica e compartilhada das colunas da aba Jovem Aprendiz.
-- Antes desta migration, nomes, ordem e sala padrao existiam somente no
-- localStorage de cada navegador, produzindo visualizacoes divergentes.

CREATE TABLE IF NOT EXISTS public.jovem_aprendiz_programas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    sala_padrao TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    atualizado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT jovem_aprendiz_programas_nome_valido CHECK (length(btrim(nome)) > 0),
    CONSTRAINT jovem_aprendiz_programas_tenant_nome_unique UNIQUE (tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_ja_programas_tenant_ordem
    ON public.jovem_aprendiz_programas (tenant_id, ativo, ordem, created_at);

ALTER TABLE public.jovem_aprendiz_programas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jovem_aprendiz_programas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "JA programas: leitura do tenant" ON public.jovem_aprendiz_programas;
CREATE POLICY "JA programas: leitura do tenant"
    ON public.jovem_aprendiz_programas
    FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "JA programas: criacao por gestores" ON public.jovem_aprendiz_programas;
CREATE POLICY "JA programas: criacao por gestores"
    ON public.jovem_aprendiz_programas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_current_tenant_id()
        AND criado_por = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.tenant_id = jovem_aprendiz_programas.tenant_id
              AND u.role IN ('admin', 'editor')
              AND u.status = 'active'
        )
    );

DROP POLICY IF EXISTS "JA programas: alteracao por gestores" ON public.jovem_aprendiz_programas;
CREATE POLICY "JA programas: alteracao por gestores"
    ON public.jovem_aprendiz_programas
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.tenant_id = jovem_aprendiz_programas.tenant_id
              AND u.role IN ('admin', 'editor')
              AND u.status = 'active'
        )
    )
    WITH CHECK (
        tenant_id = public.get_current_tenant_id()
        AND atualizado_por = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.tenant_id = jovem_aprendiz_programas.tenant_id
              AND u.role IN ('admin', 'editor')
              AND u.status = 'active'
        )
    );

-- A Data API passou a exigir grants explicitos para tabelas novas.
REVOKE ALL ON TABLE public.jovem_aprendiz_programas FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.jovem_aprendiz_programas TO authenticated;
GRANT ALL ON TABLE public.jovem_aprendiz_programas TO service_role;

-- Preserva as colunas padrao e todas as origens que ja possuem aulas.
WITH defaults(nome, ordem) AS (
    VALUES
        ('Assist. Adm Integral', 0),
        ('Assist. Adm Manhã', 1),
        ('Assist. Adm Tarde', 2),
        ('Assist. Log', 3),
        ('Aprendiz', 4)
)
INSERT INTO public.jovem_aprendiz_programas (tenant_id, nome, ordem)
SELECT t.id, d.nome, d.ordem
FROM public.tenants t
CROSS JOIN defaults d
WHERE NOT EXISTS (
    SELECT 1
    FROM public.aulas a
    WHERE a.tenant_id = t.id
      AND a.tipo_aula = 'PROGRAMA'
      AND a.origem IS NOT NULL
      AND btrim(a.origem) <> ''
)
ON CONFLICT (tenant_id, nome) DO NOTHING;

WITH origens AS (
    SELECT DISTINCT tenant_id, btrim(origem) AS nome
    FROM public.aulas
    WHERE tipo_aula = 'PROGRAMA'
      AND origem IS NOT NULL
      AND btrim(origem) <> ''
)
INSERT INTO public.jovem_aprendiz_programas (tenant_id, nome, ordem)
SELECT o.tenant_id, o.nome,
       100 + row_number() OVER (PARTITION BY o.tenant_id ORDER BY o.nome)::integer
FROM origens o
ON CONFLICT (tenant_id, nome) DO NOTHING;

-- Remove da configuracao compartilhada os placeholders do codigo antigo quando
-- o tenant ja possui programas reais. O registro inativo e mantido para impedir
-- que um localStorage desatualizado volte a publica-lo durante a migracao legada.
UPDATE public.jovem_aprendiz_programas p
SET ativo = false, updated_at = now()
WHERE p.nome IN (
    'Assist. Adm Integral',
    'Assist. Adm Manhã',
    'Assist. Adm Tarde',
    'Assist. Log',
    'Aprendiz'
)
AND NOT EXISTS (
    SELECT 1
    FROM public.aulas a
    WHERE a.tenant_id = p.tenant_id
      AND a.tipo_aula = 'PROGRAMA'
      AND btrim(a.origem) = p.nome
)
AND EXISTS (
    SELECT 1
    FROM public.aulas a
    WHERE a.tenant_id = p.tenant_id
      AND a.tipo_aula = 'PROGRAMA'
      AND a.origem IS NOT NULL
      AND btrim(a.origem) <> ''
);

-- Habilita atualizacao imediata entre navegadores, sem depender de recarregar a pagina.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'jovem_aprendiz_programas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.jovem_aprendiz_programas;
    END IF;
END $$;
