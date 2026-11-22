import { supabase } from '../lib/supabase';
import { tenantService } from './tenant.service';
import { permissionService } from './permission.service';
import { parseInstructorPlanningData } from './instructorPlanning.service';
import type { InstructorPlanningData } from './instructorPlanning.service';
import type { CatalogoCurso, DisciplinaCurso } from '../types';
import type { CourseSession } from '../utils/coursePlanning';
import type { PlanningBooking } from '../utils/instructorPlanning';
import { curriculumMinutes } from '../utils/coursePlanning';
import { planningDates } from '../utils/instructorPlanning';
import { validDateKey } from '../utils/turmaReschedule';

export interface CoursePlanningData {
    course: CatalogoCurso; subjects: DisciplinaCurso[]; planning: InstructorPlanningData; roomBookings: PlanningBooking[];
}
export interface CourseCreationRequest {
    id: string; curso: string; instrutor: string; numero: string; sala: string;
    inicioBusca: string; fimBusca: string; aulas: CourseSession[];
}
export interface CourseCreationResult { applied: boolean; turmaId: string | null; count: number; snapshot: unknown }
export class CourseCommitUncertainError extends Error {}
function rpcError(error: { code?: string; message?: string }) {
    if (['PGRST202','42883','42P01'].includes(error.code || '')) return new Error('O planejamento de cursos ainda não está habilitado. Nenhuma turma foi criada.');
    return new Error(error.message || 'Não foi possível concluir. Confira a agenda antes de tentar novamente.');
}
export const coursePlanningService = {
    async load(courseId: string, instructorId: string, from: string, to: string, room: string): Promise<CoursePlanningData> {
        const tenant = tenantService.getCurrentTenantId(); planningDates(from, to);
        const { data, error } = await supabase.rpc('consultar_base_cronograma', { p_curso: courseId, p_instrutor: instructorId, p_inicio: from, p_fim: to, p_sala: room.trim() });
        if (error) throw rpcError(error);
        if (!data?.curso || !Array.isArray(data.disciplinas) || !Array.isArray(data.sala)) throw new Error('Consulta incompleta. Tente novamente.');
        const c = data.curso;
        if (c.tenant_id !== tenant || c.id !== courseId || c.ativo !== true) throw new Error('Curso indisponível nesta unidade.');
        const course: CatalogoCurso = { id: c.id, tenantId: c.tenant_id, nomeCurso: c.nome_curso, cargaTotalHoras: Number(c.carga_total_horas), tipoHoraMin: c.tipo_hora_min, ativo: c.ativo };
        const subjects: DisciplinaCurso[] = data.disciplinas.map((d: any) => ({ id: d.id, tenantId: d.tenant_id, cursoId: d.curso_id, nomeDisciplina: d.nome_disciplina, cargaHoras: Number(d.carga_horas), tipoDisciplina: d.tipo_disciplina, ordem: d.ordem }));
        curriculumMinutes(course, subjects);
        if (data.sala.some((b: PlanningBooking) => !validDateKey(b?.data) || typeof b?.id !== 'string')) throw new Error('A ocupação da sala está incompleta.');
        return { course, subjects, planning: parseInstructorPlanningData(data.planejamento), roomBookings: data.sala };
    },
    async submit(request: CourseCreationRequest, apply: boolean, expected: unknown = null): Promise<CourseCreationResult> {
        tenantService.getCurrentTenantId();
        if (!permissionService.hasPermission('CREATE_CLASS')) throw new Error('Você não tem permissão para criar turmas e aulas.');
        let response;
        try { response = await supabase.rpc('criar_turma_planejada', { p_pedido: request, p_aplicar: apply, p_expected: expected }); }
        catch (err) { if (apply) throw new CourseCommitUncertainError('Confirmação sem resposta.'); throw err; }
        const { data, error } = response;
        if (error) { if (apply && !error.code) throw new CourseCommitUncertainError('Confirmação sem resposta.'); throw rpcError(error); }
        if (!data || data.applied !== apply || !Number.isInteger(data.count) || data.count !== request.aulas.length || (apply ? data.turmaId !== request.id : !data.snapshot || typeof data.snapshot !== 'object'))
            { if (apply) throw new CourseCommitUncertainError('Resposta de confirmação incompleta.'); throw new Error('Resposta de conferência incompleta. Tente novamente.'); }
        return data;
    }
};
