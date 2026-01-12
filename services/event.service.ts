
import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { auditService } from './audit.service';
// Import ServiceResult from index (which re-exports from registration) or directly.
// To avoid circular dependency issues if index imports this, I will import Type from registration.service directly.
import { ServiceResult } from './registration.service';
import { Evento, EventStatus, EventType } from '../types';

export interface EventInput {
    nome: string;
    tipo: EventType;
    data: string; // ISO Date YYYY-MM-DD
    horario_inicio: string;
    horario_fim: string;
    instrutor_id?: string;
    sala?: string;
    status: EventStatus;
}

export const eventService = {
    async list(): Promise<Evento[]> {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) throw error;

        // Map DB to Frontend Type
        return (data || []).map((e: any) => ({
            id: e.id,
            tenantId: e.tenant_id,
            nome: e.name,
            tipo: e.type as EventType,
            data: new Date(e.date + 'T00:00:00'), // Ensure local date interpretation
            horarioInicio: e.start_time.substring(0, 5),
            horarioFim: e.end_time.substring(0, 5),
            instrutorId: e.instructor_id,
            sala: e.room || '',
            status: e.status as EventStatus
        }));
    },

    async create(input: EventInput): Promise<ServiceResult> {
        // Permission Check: Admin or Editor
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Evento');
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        const { data, error } = await supabase
            .from('events')
            .insert({
                tenant_id: tenantId,
                name: input.nome,
                type: input.tipo,
                date: input.data,
                start_time: input.horario_inicio,
                end_time: input.horario_fim,
                instructor_id: input.instrutor_id || null,
                room: input.sala || null,
                status: input.status
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'evento',
            entityId: data.id,
            details: { nome: input.nome, tipo: input.tipo },
            result: 'success'
        });

        return { success: true, data };
    },

    async update(id: string, input: Partial<EventInput>): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Evento:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        // Validate Tenant
        const { data: existing } = await supabase
            .from('events')
            .select('tenant_id')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Evento não encontrado.' };
        }

        // Technically RLS handles this, but good for explicit check if needed
        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'evento', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        const updateData: any = {};
        if (input.nome) updateData.name = input.nome;
        if (input.tipo) updateData.type = input.tipo;
        if (input.data) updateData.date = input.data;
        if (input.horario_inicio) updateData.start_time = input.horario_inicio;
        if (input.horario_fim) updateData.end_time = input.horario_fim;
        if (input.instrutor_id !== undefined) updateData.instructor_id = input.instrutor_id || null;
        if (input.sala !== undefined) updateData.room = input.sala || null;
        if (input.status) updateData.status = input.status;

        const { error } = await supabase
            .from('events')
            .update(updateData)
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'UPDATE',
            entity: 'evento',
            entityId: id,
            details: { changes: Object.keys(input) },
            result: 'success'
        });

        return { success: true };
    },

    async delete(id: string): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Evento:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const { data: existing } = await supabase
            .from('events')
            .select('tenant_id, name')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Evento não encontrado.' };
        }

        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'DELETE',
            entity: 'evento',
            entityId: id,
            details: { nome: existing.name },
            result: 'success'
        });

        return { success: true };
    }
};
