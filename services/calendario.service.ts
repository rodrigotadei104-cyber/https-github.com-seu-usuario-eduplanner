import { supabase } from '../lib/supabase';
import { Feriado, DataBloqueada } from '../types';

export const calendarioService = {
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

    async getFeriados(): Promise<Feriado[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data, error } = await supabase
            .from('feriados')
            .select('*')
            .eq('ativo', true)
            .order('data');

        if (error) {
            console.error('[Calendário] ERRO ao buscar feriados do Supabase:', error);
            throw error;
        }
        console.log('[Calendário] Raw feriados brutos do Supabase:', data);

        // Tabela real: id, tenant_id, data, descricao, tipo, ativo, created_at
        return (data || []).map(f => ({
            ...f,
            tenantId: f.tenant_id,
            dataReferencia: f.data,
            nome: f.descricao,        // alias para o componente
            recorrenteAnualmente: false,
        })) as Feriado[];
    },

    async getDatasBloqueadas(): Promise<DataBloqueada[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Não autenticado');

        const { data, error } = await supabase
            .from('datas_bloqueadas')
            .select('*')
            .eq('ativo', true)
            .order('data');

        if (error) throw error;

        return (data || []).map(b => ({
            ...b,
            tenantId: b.tenant_id,
            criadoPor: b.criado_por,
            dataBloqueio: b.data,
        })) as DataBloqueada[];
    },

    async createFeriado(feriado: { dataReferencia: string; nome: string; tipo: string; recorrenteAnualmente: boolean }): Promise<void> {
        const tenantId = await this._getTenantId();
        const { error } = await supabase.from('feriados').insert([{
            tenant_id: tenantId,
            data: feriado.dataReferencia,
            descricao: feriado.nome,   // coluna real = descricao
            tipo: feriado.tipo,
            ativo: true,
        }]);
        if (error) throw error;
    },

    async importarFeriadosLote(feriados: Array<{ data: string; nome: string; tipo: string }>): Promise<{ importados: number; duplicatas: number; erros: string[] }> {
        const tenantId = await this._getTenantId();

        const { data: existentes } = await supabase
            .from('feriados')
            .select('data')
            .eq('tenant_id', tenantId)
            .eq('ativo', true);   // ← ignorar soft-deletados

        const datasExistentes = new Set((existentes || []).map(f => f.data));
        const novos = feriados.filter(f => !datasExistentes.has(f.data));
        const duplicatas = feriados.length - novos.length;

        if (novos.length === 0) return { importados: 0, duplicatas, erros: [] };

        const payload = novos.map(f => ({
            tenant_id: tenantId,
            data: f.data,
            descricao: f.nome,         // coluna real = descricao
            tipo: f.tipo,
            ativo: true,
        }));

        const { error } = await supabase.from('feriados').insert(payload);
        if (error) throw error;

        return { importados: novos.length, duplicatas, erros: [] };
    },

    async createBloqueio(bloqueio: { dataBloqueio: string; motivo: string }): Promise<void> {
        const tenantId = await this._getTenantId();
        const { data: { session } } = await supabase.auth.getSession();
        const { error } = await supabase.from('datas_bloqueadas').insert([{
            tenant_id: tenantId,
            data: bloqueio.dataBloqueio,
            motivo: bloqueio.motivo,
            criado_por: session?.user?.id,
            ativo: true,
        }]);
        if (error) throw error;
    },

    async deleteFeriado(id: string): Promise<void> {
        const { error } = await supabase.from('feriados').update({ ativo: false }).eq('id', id);
        if (error) throw error;
    },

    async deleteBloqueio(id: string): Promise<void> {
        const { error } = await supabase.from('datas_bloqueadas').update({ ativo: false }).eq('id', id);
        if (error) throw error;
    },

    async getDiasBloqueadosSet(): Promise<Set<string>> {
        const [feriados, bloqueios] = await Promise.all([
            this.getFeriados(),
            this.getDatasBloqueadas()
        ]);

        // ─── DIAGNÓSTICO TEMPORÁRIO ─────────────────────────────────────
        console.log('[Calendário] getFeriados() retornou:', feriados.length, 'registros', feriados.map(f => (f as any).data));
        console.log('[Calendário] getDatasBloqueadas() retornou:', bloqueios.length, 'registros', bloqueios.map(b => (b as any).data));
        // ────────────────────────────────────────────────────────────────

        const bloqSet = new Set<string>();

        // Normalizar para YYYY-MM-DD — o Supabase às vezes retorna timestamps completos
        const toISO = (v: string) => (v || '').substring(0, 10);

        feriados.forEach(f => bloqSet.add(toISO((f as any).dataReferencia || f.data)));
        bloqueios.forEach(b => bloqSet.add(toISO((b as any).dataBloqueio || b.data)));

        console.log('[Calendário] Set de dias bloqueados:', Array.from(bloqSet));

        return bloqSet;
    }
};
