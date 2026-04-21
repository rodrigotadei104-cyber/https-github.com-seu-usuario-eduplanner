import { supabase } from '../lib/supabase';

// Tipo que descreve a entrada requerida pela RPC `import_update_course_transaction`
export interface ImportUpdatePayload {
    p_course_id: string; // uuid
    p_tenant_id: string; // uuid
    p_course_data: any; // jsonb
    p_materias_data: any; // jsonb
    p_aulas_data: any; // jsonb
    p_user_id: string; // uuid
}

// Wrapper to create a snapshot and execute the RPC
export const runImportTransaction = async (payload: ImportUpdatePayload) => {
    // 1. Create Snapshot BEFORE making any changes
    const snapshotRes = await supabase.from('course_snapshots').insert({
        tenant_id: payload.p_tenant_id,
        curso_id: payload.p_course_id,
        snapshot_data: {
            course: payload.p_course_data,
            materias: payload.p_materias_data,
            aulas: payload.p_aulas_data,
            timestamp: new Date().toISOString(),
            reason: 'IMPORT_UPDATE_OVERWRITE'
        },
        created_by: payload.p_user_id
    });

    if (snapshotRes.error) {
        console.error('Snapshot failed:', snapshotRes.error);
        return { success: false, error: 'Falha ao criar snapshot de segurança antes da atualização', details: snapshotRes.error };
    }

    // 2. Execute RPC to safely replace Materias and Aulas
    const rpcRes = await supabase.rpc('import_update_course_transaction', payload);

    if (rpcRes.error) {
        console.error('RPC Transaction Failed:', rpcRes.error);
        return { success: false, error: 'Falha na transação atômica do curso', details: rpcRes.error };
    }

    // Se a RPC retorna um objeto text, parseamos pra checar se foi sucesso
    if (rpcRes.data) {
        try {
            const resultObj = typeof rpcRes.data === 'string' ? JSON.parse(rpcRes.data) : rpcRes.data;
            if (resultObj.success) {
                return { success: true };
            } else {
                return { success: false, error: resultObj.message || 'Erro desconhecido na RPC', details: resultObj };
            }
        } catch (e) {
            // Caso não consiga parsear mas não deu erro na request
            return { success: true, warning: 'Resposta da RPC em formato não-JSON', raw: rpcRes.data };
        }
    }

    return { success: true };
};
