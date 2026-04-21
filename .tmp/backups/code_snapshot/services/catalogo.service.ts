import { supabase } from '../lib/supabase';
import { CatalogoCurso, DisciplinaCurso } from '../types';

export const catalogoService = {
    async _getTenantId(): Promise<string> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');
        const { data, error } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', session.user.id)
            .single();
        if (error || !data) throw new Error('Falha ao obter tenant_id');
        return data.tenant_id;
    },

    async getCursos(): Promise<CatalogoCurso[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data, error } = await supabase
            .from('catalogo_cursos')
            .select('*')
            .eq('ativo', true)
            .order('nome_curso');

        if (error) throw error;

        return (data || []).map(c => ({
            ...c,
            tenantId: c.tenant_id,
            nomeCurso: c.nome_curso,
            cargaTotalHoras: c.carga_total_horas,
            tipoHoraMin: c.tipo_hora_min,
            createdAt: c.created_at
        })) as CatalogoCurso[];
    },

    async getDisciplinasPorCurso(cursoId: string): Promise<DisciplinaCurso[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data, error } = await supabase
            .from('disciplinas_curso')
            .select('*')
            .eq('curso_id', cursoId)
            // Ordenação primária por 'ordem' (NULLS lidos por último), secundária por 'tipo_disciplina'
            .order('ordem', { nullsFirst: false })
            .order('tipo_disciplina', { ascending: false }); // 'teorica' > 'pratica' por ordem alfabética inversa (t vem antes de p? não, t > p. Descending = teorica first)

        if (error) throw error;

        return (data || []).map(d => ({
            ...d,
            tenantId: d.tenant_id,
            cursoId: d.curso_id,
            nomeDisciplina: d.nome_disciplina,
            cargaHoras: d.carga_horas,
            tipoDisciplina: d.tipo_disciplina,
            createdAt: d.created_at
        })) as DisciplinaCurso[];
    },

    async createCurso(curso: Omit<CatalogoCurso, 'id' | 'tenantId' | 'createdAt'>): Promise<CatalogoCurso> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const tenantId = await this._getTenantId();

        const { data, error } = await supabase
            .from('catalogo_cursos')
            .insert([{
                tenant_id: tenantId,
                nome_curso: curso.nomeCurso,
                carga_total_horas: curso.cargaTotalHoras,
                tipo_hora_min: curso.tipoHoraMin,
                ativo: curso.ativo !== undefined ? curso.ativo : true
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            tenantId: data.tenant_id,
            nomeCurso: data.nome_curso,
            cargaTotalHoras: data.carga_total_horas,
            tipoHoraMin: data.tipo_hora_min,
            ativo: data.ativo,
            createdAt: data.created_at
        };
    },

    async updateCurso(id: string, updates: Partial<CatalogoCurso>): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const payload: any = {};
        if (updates.nomeCurso !== undefined) payload.nome_curso = updates.nomeCurso;
        if (updates.cargaTotalHoras !== undefined) payload.carga_total_horas = updates.cargaTotalHoras;
        if (updates.tipoHoraMin !== undefined) payload.tipo_hora_min = updates.tipoHoraMin;
        if (updates.ativo !== undefined) payload.ativo = updates.ativo;

        const { error } = await supabase
            .from('catalogo_cursos')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
    },

    async deleteCurso(id: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { error } = await supabase
            .from('catalogo_cursos')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async createDisciplina(cursoId: string, disciplina: Omit<DisciplinaCurso, 'id' | 'tenantId' | 'cursoId' | 'createdAt'>): Promise<DisciplinaCurso> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const tenantId = await this._getTenantId();

        const { data, error } = await supabase
            .from('disciplinas_curso')
            .insert([{
                tenant_id: tenantId,
                curso_id: cursoId,
                nome_disciplina: disciplina.nomeDisciplina,
                carga_horas: disciplina.cargaHoras,
                tipo_disciplina: disciplina.tipoDisciplina,
                ordem: disciplina.ordem
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            tenantId: data.tenant_id,
            cursoId: data.curso_id,
            nomeDisciplina: data.nome_disciplina,
            cargaHoras: data.carga_horas,
            tipoDisciplina: data.tipo_disciplina,
            ordem: data.ordem,
            createdAt: data.created_at
        };
    },

    async importarCatalogoLote(cursosComDisciplinas: Array<{
        curso: Omit<CatalogoCurso, 'id' | 'tenantId' | 'createdAt'>,
        disciplinas: Omit<DisciplinaCurso, 'id' | 'tenantId' | 'cursoId' | 'createdAt'>[]
    }>): Promise<{ success: boolean; cursosLidos: number; disciplinasCriadas: number; erros: string[] }> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        let cursosCriados = 0;
        let disciplinasCriadasCount = 0;
        const erros: string[] = [];

        for (const item of cursosComDisciplinas) {
            try {
                // 1. Cria o curso pai
                const novoCurso = await this.createCurso(item.curso);
                cursosCriados++;

                // 2. Prepara batch de disciplinas atrelando ao ID gerado
                if (item.disciplinas && item.disciplinas.length > 0) {
                    const tenantId = await this._getTenantId();
                    const payloadsDisciplinas = item.disciplinas.map(d => ({
                        tenant_id: tenantId,
                        curso_id: novoCurso.id,
                        nome_disciplina: d.nomeDisciplina,
                        carga_horas: d.cargaHoras,
                        tipo_disciplina: d.tipoDisciplina,
                        ordem: d.ordem
                    }));

                    const { error: errorDisc } = await supabase
                        .from('disciplinas_curso')
                        .insert(payloadsDisciplinas);

                    if (errorDisc) {
                        erros.push(`Erro ao inserir disciplinas do curso ${item.curso.nomeCurso}: ${errorDisc.message}`);
                    } else {
                        disciplinasCriadasCount += item.disciplinas.length;
                    }
                }
            } catch (err: any) {
                erros.push(`Erro ao criar curso ${item.curso.nomeCurso}: ${err?.message || 'Erro desconhecido'}`);
            }
        }

        return {
            success: erros.length === 0,
            cursosLidos: cursosCriados,
            disciplinasCriadas: disciplinasCriadasCount,
            erros
        };
    },
    async migrarCursosLegados(): Promise<{
        novos: Array<{ curso: any; materias: any[] }>;
        duplicatas: Array<{ nomeLegado: string; nomeCatalogo: string }>;
        duplicatasInternas: Array<{ nomeLegado: string; motivo: string }>;
        totalLegado: number;
        totalLegadoUnico: number;
    }> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        // 1. Buscar cursos legados e catálogo existente em paralelo
        const [{ data: cursosLegados, error: errLeg }, { data: catalogoAtual, error: errCat }, { data: materias, error: errMat }] = await Promise.all([
            supabase.from('cursos').select('id, nome, carga_horaria, minutos_por_hora, cor').order('nome'),
            supabase.from('catalogo_cursos').select('nome_curso'),
            supabase.from('materias').select('id, nome, curso_id, carga_horaria')
        ]);

        if (errLeg) throw errLeg;
        if (errCat) throw errCat;

        // 2. Índice de nomes já no catálogo (normalizado para comparação)
        const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const catalogoNomes = new Set((catalogoAtual || []).map(c => normalize(c.nome_curso)));

        // 3. Mapear materias por curso_id
        const materiasPorCurso = new Map<string, any[]>();
        (materias || []).forEach(m => {
            if (!materiasPorCurso.has(m.curso_id)) materiasPorCurso.set(m.curso_id, []);
            materiasPorCurso.get(m.curso_id)!.push(m);
        });

        // 3.5. Deduplicação INTERNA do legado:
        // Para cada nome repetido dentro da tabela `cursos`, manter apenas o registro
        // mais completo (maior número de matérias vinculadas). Registrar os descartados.
        const legadoUnico = new Map<string, any>(); // normKey → melhor registro
        const duplicatasInternas: Array<{ nomeLegado: string; motivo: string }> = [];

        for (const leg of (cursosLegados || [])) {
            const normNome = normalize(leg.nome);
            const qtdMaterias = (materiasPorCurso.get(leg.id) || []).length;

            if (!legadoUnico.has(normNome)) {
                legadoUnico.set(normNome, { ...leg, _qtdMaterias: qtdMaterias });
            } else {
                const atual = legadoUnico.get(normNome);
                if (qtdMaterias > atual._qtdMaterias) {
                    // Este é mais completo — substituir e descartar o anterior
                    duplicatasInternas.push({ nomeLegado: leg.nome, motivo: `repetido no legado (mantendo versão com ${qtdMaterias} matérias)` });
                    legadoUnico.set(normNome, { ...leg, _qtdMaterias: qtdMaterias });
                } else {
                    // Descartar este — o atual já é melhor ou igual
                    duplicatasInternas.push({ nomeLegado: leg.nome, motivo: `repetido no legado (versão com ${qtdMaterias} matérias descartada)` });
                }
            }
        }

        // 4. Classificar cada curso legado (já deduplicado) contra o catálogo existente
        const novos: Array<{ curso: any; materias: any[] }> = [];
        const duplicatas: Array<{ nomeLegado: string; nomeCatalogo: string }> = [];

        for (const leg of Array.from(legadoUnico.values())) {
            const normNome = normalize(leg.nome);
            if (catalogoNomes.has(normNome)) {
                // Já existe — registrar como duplicata
                const nomeNocat = (catalogoAtual || []).find(c => normalize(c.nome_curso) === normNome)?.nome_curso || leg.nome;
                duplicatas.push({ nomeLegado: leg.nome, nomeCatalogo: nomeNocat });
            } else {
                // Novo — incluir na lista de importação
                novos.push({
                    curso: {
                        nome: leg.nome,
                        carga_horaria: leg.carga_horaria,
                        minutos_por_hora: leg.minutos_por_hora,
                        cor: leg.cor,
                        legacyId: leg.id
                    },
                    materias: (materiasPorCurso.get(leg.id) || [])
                });
            }
        }

        return {
            novos,
            duplicatas,           // já existem no catálogo novo
            duplicatasInternas,   // repetidos dentro do próprio legado
            totalLegado: (cursosLegados || []).length,
            totalLegadoUnico: legadoUnico.size,
        };
    },

    async executarMigracaoLegados(novos: Array<{ curso: any; materias: any[] }>): Promise<{ importados: number; disciplinasCriadas: number; erros: string[] }> {
        const tenantId = await this._getTenantId();
        let importados = 0;
        let disciplinasCriadas = 0;
        const erros: string[] = [];

        for (const item of novos) {
            try {
                const { data: novoCurso, error: errCurso } = await supabase
                    .from('catalogo_cursos')
                    .insert([{
                        tenant_id: tenantId,
                        nome_curso: item.curso.nome,
                        carga_total_horas: Number(item.curso.carga_horaria) || 0,
                        tipo_hora_min: String(item.curso.minutos_por_hora || 60),
                        ativo: true
                    }])
                    .select('id')
                    .single();

                if (errCurso) throw errCurso;
                importados++;

                // Importar matérias como disciplinas
                if (item.materias.length > 0) {
                    const payloadDisc = item.materias.map((m, idx) => ({
                        tenant_id: tenantId,
                        curso_id: novoCurso.id,
                        nome_disciplina: m.nome,
                        carga_horas: Number(m.carga_horaria) || 0,
                        tipo_disciplina: 'teorica',
                        ordem: idx + 1
                    }));

                    const { error: errDisc } = await supabase.from('disciplinas_curso').insert(payloadDisc);
                    if (errDisc) {
                        erros.push(`Disciplinas de "${item.curso.nome}" não migradas: ${errDisc.message}`);
                    } else {
                        disciplinasCriadas += item.materias.length;
                    }
                }
            } catch (err: any) {
                erros.push(`"${item.curso.nome}": ${err?.message || 'Falha desconhecida'}`);
            }
        }

        return { importados, disciplinasCriadas, erros };
    }
};
