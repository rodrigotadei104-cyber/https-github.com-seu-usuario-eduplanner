import { supabase } from '../lib/supabase';
import { Turma } from '../types';

export const turmaService = {
    async getTurmas(): Promise<Turma[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data, error } = await supabase
            .from('turmas')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(t => ({
            ...t,
            tenantId: t.tenant_id,
            numeroTurma: t.numero_turma,
            cursoId: t.curso_id,
            instrutorId: t.instrutor_id,
            salaPadrao: t.sala_padrao,
            dataInicio: t.data_inicio,
            diasSemanaSelecionados: t.dias_semana_selecionados,
            horariosDoDia: t.horarios_do_dia,
            datasBloqueadas: t.datas_bloqueadas,
            createdAt: t.created_at
        })) as Turma[];
    },

    async create(turmaData: Omit<Turma, 'id' | 'createdAt'>): Promise<Turma> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        let tenantId = (turmaData as any).tenantId;

        if (!tenantId) {
            const { data: userRecord, error: userError } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', session.user.id)
                .single();

            if (userError || !userRecord?.tenant_id) {
                console.error('[turmaService] Erro ao buscar tenant:', userError);
                throw new Error('Tenant não encontrado para o usuário. Verifique se o perfil do usuário está configurado.');
            }
            tenantId = userRecord.tenant_id;
        }

        const payload = {
            tenant_id: tenantId,
            numero_turma: turmaData.numeroTurma,
            curso_id: turmaData.cursoId,
            instrutor_id: turmaData.instrutorId,
            sala_padrao: turmaData.salaPadrao,
            data_inicio: turmaData.dataInicio,
            dias_semana_selecionados: turmaData.diasSemanaSelecionados,
            horarios_do_dia: turmaData.horariosDoDia,
            datas_bloqueadas: turmaData.datasBloqueadas || [],
            status: turmaData.status
        };

        const { data, error } = await supabase
            .from('turmas')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        return {
            ...data,
            tenantId: data.tenant_id,
            numeroTurma: data.numero_turma,
            cursoId: data.curso_id,
            instrutorId: data.instrutor_id,
            salaPadrao: data.sala_padrao,
            dataInicio: data.data_inicio,
            diasSemanaSelecionados: data.dias_semana_selecionados,
            horariosDoDia: data.horarios_do_dia,
            datasBloqueadas: data.datas_bloqueadas,
            createdAt: data.created_at
        } as Turma;
    }
};
