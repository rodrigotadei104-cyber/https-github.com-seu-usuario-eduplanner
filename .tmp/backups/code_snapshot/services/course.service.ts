
import { supabase } from '../lib/supabase';
import { Curso, Materia } from '../types';

export interface SubjectProgress {
    id: string;
    name: string;
    targetHours: number;
    completedHours: number;
    percentage: number;
    status: 'pending' | 'in_progress' | 'completed';
    display: string; // "5h/10h" (Realized)
    displayPlanned: string; // "10h/10h" (Planned)
}

export interface CourseProgress {
    courseId: string;
    courseName: string;
    targetHours: number;
    completedHours: number; // Realized
    plannedHours: number; // Planned (Scheduled + Realized)
    percentage: number;
    isCompleted: boolean;
    display: string; // "45h/50h" (Realized)
    displayPlanned: string; // "50h/50h" (Planned)
    subjects: SubjectProgress[];
}

export const courseService = {
    /**
     * Calcula o progresso de um curso e suas matérias
     * Baseado na soma de carga_horaria_materia das aulas
     */
    async getCourseProgress(courseId: string, tenantId: string, numeroTurma?: string): Promise<CourseProgress | null> {
        // 1. Buscar Curso e Matérias
        const { data: curso, error: cursoError } = await supabase
            .from('cursos')
            .select('*, materias(*)')
            .eq('id', courseId)
            .single();

        if (cursoError || !curso) {
            console.error('Error fetching course:', cursoError);
            return null;
        }

        const minutosPorHora = Number(curso.minutos_por_hora) || 60;

        // 2. Buscar Aulas do Curso (para somar horas)
        // Apenas aulas que não foram canceladas
        let request = supabase
            .from('aulas')
            .select('materia_id, horario_inicio, horario_fim, status, data, numero_turma')
            .eq('curso_id', courseId)
            .neq('status', 'cancelada');

        // Filter by Cohort if provided
        if (numeroTurma) {
            request = request.eq('numero_turma', numeroTurma);
        }

        const { data: aulas, error: aulasError } = await request;

        if (aulasError) {
            console.error('Error fetching classes:', aulasError);
            return null;
        }

        // Helper to calc duration in hours (Legal Hours)
        const calcLegalHours = (start: string, end: string) => {
            if (!start || !end) return 0;
            const [h1, m1] = start.split(':').map(Number);
            const [h2, m2] = end.split(':').map(Number);
            const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (minutes <= 0) return 0;
            return Number((minutes / minutosPorHora).toFixed(2));
        };

        // 3. Processar Progresso por Matéria
        const subjectsProgress: SubjectProgress[] = (curso.materias || []).map((materia: any) => {
            const target = materia.carga_horaria || 0;

            // Somar horas das aulas desta matéria
            const subjectClasses = aulas?.filter(a => a.materia_id === materia.id) || [];

            // STRICT Completed: Only 'concluida'
            const strictCompleted = subjectClasses.reduce((acc, aula) => {
                const isDone = ['concluida'].includes(aula.status);
                if (!isDone) return acc;
                return acc + calcLegalHours(aula.horario_inicio, aula.horario_fim);
            }, 0);

            // Active: 'em_andamento'
            const active = subjectClasses.reduce((acc, aula) => {
                const isActive = ['em_andamento', 'em_andamento'].includes(aula.status); // Keep typo compatible just in case
                if (!isActive) return acc;
                return acc + calcLegalHours(aula.horario_inicio, aula.horario_fim);
            }, 0);

            const totalRealized = strictCompleted + active; // For percentage/bar
            const planned = subjectClasses.reduce((acc, aula) => {
                return acc + calcLegalHours(aula.horario_inicio, aula.horario_fim);
            }, 0);

            // Round for display
            const completedDisplay = Math.round(strictCompleted);
            const activeDisplay = Math.round(active);

            // Percentage based on Realized (Completed + Active) to show progress bar moving
            const percentage = target > 0 ? Math.round((totalRealized / target) * 100) : 0;

            // Status Logic: Only completed if STRICT completed meets target
            const status = strictCompleted >= target ? 'completed' : (totalRealized > 0 ? 'in_progress' : 'pending');

            return {
                id: materia.id,
                name: materia.nome,
                targetHours: target,
                completedHours: strictCompleted, // Export Strict
                activeHours: active, // Export Active
                percentage,
                status,
                display: `${Math.round(totalRealized)}h/${target}h`, // Display total realized (so user sees active count)
                displayPlanned: `${Math.round(planned)}h/${target}h`
            };
        });

        // 4. Processar Progresso Total do Curso
        let courseTarget = 0;
        if (curso.carga_horaria) {
            const match = curso.carga_horaria.toString().match(/(\d+)/);
            if (match) {
                courseTarget = parseInt(match[1], 10);
            }
        }

        if (!courseTarget) {
            courseTarget = subjectsProgress.reduce((acc, s) => acc + s.targetHours, 0);
        }

        const courseStrictCompleted = subjectsProgress.reduce((acc, s) => acc + s.completedHours, 0);
        const courseActive = subjectsProgress.reduce((acc, s) => acc + (s as any).activeHours, 0);
        const courseTotalRealized = courseStrictCompleted + courseActive;

        const globalPlanned = aulas?.reduce((acc, aula) => acc + calcLegalHours(aula.horario_inicio, aula.horario_fim), 0) || 0;

        const coursePercentage = courseTarget > 0 ? Math.round((courseTotalRealized / courseTarget) * 100) : 0;

        return {
            courseId: curso.id,
            courseName: curso.nome,
            targetHours: courseTarget,
            completedHours: Math.round(courseStrictCompleted), // Strict for logical checks
            plannedHours: Math.round(globalPlanned),
            percentage: coursePercentage, // Realized for Visuals
            isCompleted: courseStrictCompleted >= courseTarget && courseTarget > 0, // Strict Check
            display: `${Math.round(courseTotalRealized)}h/${courseTarget}h`, // Display Realized
            displayPlanned: `${Math.round(globalPlanned)}h/${courseTarget}h`,
            subjects: subjectsProgress
        };
    }
};
