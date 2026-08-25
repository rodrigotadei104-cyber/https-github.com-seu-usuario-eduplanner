import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface ProgramaJovemAprendiz {
    id: string;
    tenantId: string;
    nome: string;
    salaPadrao: string;
    ordem: number;
}

interface ProgramaRow {
    id: string;
    tenant_id: string;
    nome: string;
    sala_padrao: string | null;
    ordem: number;
}

const getAuthContext = async (): Promise<{ userId: string; tenantId: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Não autenticado');

    const { data, error } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', session.user.id)
        .single();

    if (error || !data?.tenant_id) throw error || new Error('Tenant não encontrado');
    return { userId: session.user.id, tenantId: data.tenant_id };
};

const mapRow = (row: ProgramaRow): ProgramaJovemAprendiz => ({
    id: row.id,
    tenantId: row.tenant_id,
    nome: row.nome,
    salaPadrao: row.sala_padrao || '',
    ordem: row.ordem,
});

export const programaJovemAprendizService = {
    async list(): Promise<ProgramaJovemAprendiz[]> {
        const { data, error } = await supabase
            .from('jovem_aprendiz_programas')
            .select('id, tenant_id, nome, sala_padrao, ordem')
            .eq('ativo', true)
            .order('ordem')
            .order('created_at');

        if (error) throw error;
        return ((data || []) as ProgramaRow[]).map(mapRow);
    },

    /** Migra uma unica vez as colunas antigas deste navegador sem reativar exclusoes. */
    async importLegacy(programas: string[], salas: Record<string, string>): Promise<void> {
        const { userId, tenantId } = await getAuthContext();
        const normalized = Array.from(new Set(programas.map(p => p.trim()).filter(Boolean)));
        if (normalized.length === 0) return;

        // Inclui inativos para que uma coluna excluida no compartilhado nunca seja reativada
        // por outro navegador que ainda possua um localStorage antigo.
        const { data: existing, error: selectError } = await supabase
            .from('jovem_aprendiz_programas')
            .select('nome, ordem')
            .eq('tenant_id', tenantId);
        if (selectError) throw selectError;

        const existingNames = new Set((existing || []).map(row => row.nome));
        const maxOrder = (existing || []).reduce((max, row) => Math.max(max, row.ordem || 0), -1);
        const missing = normalized.filter(nome => !existingNames.has(nome));
        if (missing.length === 0) return;

        const { error } = await supabase.from('jovem_aprendiz_programas').insert(
            missing.map((nome, index) => ({
                tenant_id: tenantId,
                nome,
                sala_padrao: salas[nome]?.trim() || null,
                ordem: maxOrder + index + 1,
                criado_por: userId,
                atualizado_por: userId,
            }))
        );
        if (error) throw error;
    },

    async add(nome: string, salaPadrao = ''): Promise<void> {
        const { userId, tenantId } = await getAuthContext();
        const { data: rows, error: orderError } = await supabase
            .from('jovem_aprendiz_programas')
            .select('ordem')
            .eq('tenant_id', tenantId)
            .order('ordem', { ascending: false })
            .limit(1);
        if (orderError) throw orderError;

        const { error } = await supabase.from('jovem_aprendiz_programas').upsert({
            tenant_id: tenantId,
            nome: nome.trim(),
            sala_padrao: salaPadrao.trim() || null,
            ordem: (rows?.[0]?.ordem ?? -1) + 1,
            ativo: true,
            criado_por: userId,
            atualizado_por: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,nome' });
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { userId } = await getAuthContext();
        const { error } = await supabase
            .from('jovem_aprendiz_programas')
            .update({ ativo: false, atualizado_por: userId, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async updateSala(id: string, salaPadrao: string): Promise<void> {
        const { userId } = await getAuthContext();
        const { error } = await supabase
            .from('jovem_aprendiz_programas')
            .update({
                sala_padrao: salaPadrao.trim() || null,
                atualizado_por: userId,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw error;
    },

    async subscribe(onChange: () => void): Promise<RealtimeChannel> {
        const { tenantId } = await getAuthContext();
        return supabase
            .channel(`jovem-aprendiz-programas:${tenantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'jovem_aprendiz_programas',
                filter: `tenant_id=eq.${tenantId}`,
            }, onChange)
            .subscribe();
    },
};
