// ============================================
// REGISTRATION SERVICE
// CRUD para Instrutores, Cursos e Matérias
// ============================================

import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { auditService } from './audit.service';

export interface ServiceResult<T = unknown> {
    success: boolean;
    error?: string;
    data?: T;
}

// ============================================
// INSTRUTORES
// ============================================

export interface InstrutorInput {
    nome: string;
    email?: string;
    telefone?: string;
}

export const instrutorService = {
    async list(): Promise<unknown[]> {
        const { data, error } = await supabase
            .from('instrutores')
            .select('*')
            .eq('active', true)
            .order('nome');

        if (error) throw error;
        return data || [];
    },

    async create(input: InstrutorInput): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Instrutor');
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        const { data, error } = await supabase
            .from('instrutores')
            .insert({ ...input, tenant_id: tenantId, active: true })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'instrutor',
            entityId: data.id,
            details: { nome: input.nome },
            result: 'success'
        });

        return { success: true, data };
    },

    async update(id: string, input: Partial<InstrutorInput>): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Instrutor:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const { data: existing } = await supabase
            .from('instrutores')
            .select('tenant_id')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Instrutor não encontrado.' };
        }

        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'instrutor', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        const { error } = await supabase
            .from('instrutores')
            .update(input)
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'UPDATE',
            entity: 'instrutor',
            entityId: id,
            details: { changes: Object.keys(input) },
            result: 'success'
        });

        return { success: true };
    },

    async delete(id: string): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Instrutor:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const { data: existing } = await supabase
            .from('instrutores')
            .select('tenant_id, nome')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Instrutor não encontrado.' };
        }

        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'instrutor', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        // Soft delete
        const { error } = await supabase
            .from('instrutores')
            .update({ active: false })
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'DELETE',
            entity: 'instrutor',
            entityId: id,
            details: { nome: existing.nome },
            result: 'success'
        });

        return { success: true };
    }
};

// ============================================
// CURSOS
// ============================================

export interface CursoInput {
    nome: string;
    carga_horaria?: number;
    cor?: string;
}

export const cursoService = {
    async list(): Promise<unknown[]> {
        const { data, error } = await supabase
            .from('cursos')
            .select('*')
            .order('nome');

        if (error) throw error;
        return data || [];
    },

    async create(input: CursoInput): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Curso');
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        const { data, error } = await supabase
            .from('cursos')
            .insert({ ...input, tenant_id: tenantId, cor: input.cor || '#3B82F6' })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'curso',
            entityId: data.id,
            details: { nome: input.nome },
            result: 'success'
        });

        return { success: true, data };
    },

    async delete(id: string): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Curso:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const { data: existing } = await supabase
            .from('cursos')
            .select('tenant_id, nome')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Curso não encontrado.' };
        }

        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'curso', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        const { error } = await supabase
            .from('cursos')
            .delete()
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'DELETE',
            entity: 'curso',
            entityId: id,
            details: { nome: existing.nome },
            result: 'success'
        });

        return { success: true };
    }
};

// ============================================
// MATÉRIAS
// ============================================

export interface MateriaInput {
    nome: string;
    curso_id: string;
    carga_horaria?: number;
}

export const materiaService = {
    async list(cursoId?: string): Promise<unknown[]> {
        let query = supabase.from('materias').select('*, curso:cursos(id, nome)');

        if (cursoId) {
            query = query.eq('curso_id', cursoId);
        }

        const { data, error } = await query.order('nome');
        if (error) throw error;
        return data || [];
    },

    async create(input: MateriaInput): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', 'Materia');
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const tenantId = tenantService.getCurrentTenantId();

        const { data, error } = await supabase
            .from('materias')
            .insert({ ...input, tenant_id: tenantId })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'CREATE',
            entity: 'materia',
            entityId: data.id,
            details: { nome: input.nome, curso_id: input.curso_id },
            result: 'success'
        });

        return { success: true, data };
    },

    async delete(id: string): Promise<ServiceResult> {
        const canManage = await permissionService.checkPermission('MANAGE_REGISTRATIONS', `Materia:${id}`);
        if (!canManage) {
            return { success: false, error: 'Permissão negada.' };
        }

        const { data: existing } = await supabase
            .from('materias')
            .select('tenant_id, nome')
            .eq('id', id)
            .single();

        if (!existing) {
            return { success: false, error: 'Matéria não encontrada.' };
        }

        const tenantValid = await tenantService.validateTenantAccess(existing.tenant_id, 'materia', id);
        if (!tenantValid) {
            return { success: false, error: 'Acesso negado.' };
        }

        const { error } = await supabase
            .from('materias')
            .delete()
            .eq('id', id);

        if (error) {
            return { success: false, error: error.message };
        }

        await auditService.log({
            action: 'DELETE',
            entity: 'materia',
            entityId: id,
            details: { nome: existing.nome },
            result: 'success'
        });

        return { success: true };
    }
};
