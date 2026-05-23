
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
    data_fim?: string; // ISO Date YYYY-MM-DD, used to create multi-day events
    horario_inicio: string;
    horario_fim: string;
    instrutor_id?: string;
    sala?: string;
    status: EventStatus;
}

export const eventService = {
    _parseLocalDate(date: string): Date {
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day);
    },

    _formatLocalDate(date: Date): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    _getDateRange(startDate: string, endDate?: string): string[] {
        const start = this._parseLocalDate(startDate);
        const end = endDate ? this._parseLocalDate(endDate) : start;

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new Error('Periodo invalido.');
        }

        if (end < start) {
            throw new Error('A data final nao pode ser anterior a data inicial.');
        }

        const dates: string[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            dates.push(this._formatLocalDate(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    },

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
            data: (() => {
                const [year, month, day] = e.date.split('-').map(Number);
                return new Date(year, month - 1, day);
            })(),
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
        let dates: string[];
        try {
            dates = this._getDateRange(input.data, input.data_fim);
        } catch (error: any) {
            return { success: false, error: error.message || 'Periodo invalido.' };
        }

        const rows = dates.map(date => ({
            tenant_id: tenantId,
            name: input.nome,
            type: input.tipo,
            date,
            start_time: input.horario_inicio,
            end_time: input.horario_fim,
            instructor_id: input.instrutor_id || null,
            room: input.sala || null,
            status: input.status
        }));

        const { data, error } = await supabase
            .from('events')
            .insert(rows)
            .select();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'evento',
            entityId: Array.isArray(data) ? (data as any[])[0]?.id : (data as any)?.id,
            details: {
                nome: input.nome,
                tipo: input.tipo,
                dataInicio: input.data,
                dataFim: input.data_fim || input.data,
                quantidade: dates.length
            },
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

    async replaceMany(ids: string[], input: EventInput): Promise<ServiceResult> {
        if (!ids.length) {
            return { success: false, error: 'Nenhum evento selecionado.' };
        }

        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Eventos');
        if (!canManage) {
            return { success: false, error: 'PermissÃ£o negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();
        const { data: existing, error: lookupError } = await supabase
            .from('events')
            .select('id, tenant_id')
            .in('id', ids);

        if (lookupError) {
            return { success: false, error: lookupError.message };
        }

        if (!existing || existing.length !== ids.length || existing.some((e: any) => e.tenant_id !== tenantId)) {
            return { success: false, error: 'Eventos nÃ£o encontrados ou acesso negado.' };
        }

        const { error: deleteError } = await supabase
            .from('events')
            .delete()
            .in('id', ids);

        if (deleteError) {
            return { success: false, error: deleteError.message };
        }

        const created = await this.create(input);
        if (!created.success) return created;

        await auditService.log({
            action: 'UPDATE',
            entity: 'evento',
            details: {
                type: 'BULK_REPLACE',
                ids,
                nome: input.nome,
                tipo: input.tipo,
                dataInicio: input.data,
                dataFim: input.data_fim || input.data
            },
            result: 'success'
        });

        return created;
    },

    async deleteMany(ids: string[]): Promise<ServiceResult> {
        if (!ids.length) {
            return { success: false, error: 'Nenhum evento selecionado.' };
        }

        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Eventos');
        if (!canManage) {
            return { success: false, error: 'PermissÃ£o negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();
        const { data: existing, error: lookupError } = await supabase
            .from('events')
            .select('id, tenant_id, name')
            .in('id', ids);

        if (lookupError) {
            return { success: false, error: lookupError.message };
        }

        if (!existing || existing.length !== ids.length || existing.some((e: any) => e.tenant_id !== tenantId)) {
            return { success: false, error: 'Eventos nÃ£o encontrados ou acesso negado.' };
        }

        const { error } = await supabase
            .from('events')
            .delete()
            .in('id', ids);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'DELETE',
            entity: 'evento',
            details: {
                type: 'BULK_DELETE',
                ids,
                quantidade: ids.length
            },
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
