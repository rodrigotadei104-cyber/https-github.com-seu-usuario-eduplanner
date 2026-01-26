
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
    async getCourseProgress(courseId: string, tenantId: string): Promise<CourseProgress | null> {
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

        // 2. Buscar Aulas do Curso (para somar horas)
        // Apenas aulas que não foram canceladas
        const { data: aulas, error: aulasError } = await supabase
            .from('aulas')
            .select('materia_id, carga_horaria_materia, status')
            .eq('curso_id', courseId)
            .neq('status', 'cancelada'); // Fetch all active instructions (Agendada + Active + Done)

        if (aulasError) {
            console.error('Error fetching classes:', aulasError);
            return null;
        }

        // 3. Processar Progresso por Matéria
        const subjectsProgress: SubjectProgress[] = (curso.materias || []).map((materia: any) => {
            const target = materia.carga_horaria || 0;

            // Somar horas das aulas desta matéria
            const subjectClasses = aulas?.filter(a => a.materia_id === materia.id) || [];

            // Realized: Only Concluded or In Progress
            const completed = subjectClasses.reduce((acc, aula) => {
                const isRealized = ['concluida', 'em_andamento', 'em_andamento'].includes(aula.status); // check snake_case too if needed
                if (!isRealized) return acc;
                const horas = Number(aula.carga_horaria_materia) || 0;
                return acc + horas;
            }, 0);

            // Planned: All non-cancelled (already filtered by query)
            const planned = subjectClasses.reduce((acc, aula) => {
                const horas = Number(aula.carga_horaria_materia) || 0;
                return acc + horas;
            }, 0);

            const percentage = target > 0 ? Math.round((completed / target) * 100) : 0;
            const status = completed >= target ? 'completed' : (completed > 0 ? 'in_progress' : 'pending');

            return {
                id: materia.id,
                name: materia.nome,
                targetHours: target,
                completedHours: completed,
                percentage,
                status,
                display: `${completed}h/${target}h`,
                displayPlanned: `${planned}h/${target}h`
            };
        });

        // 4. Processar Progresso Total do Curso
        // Nota: A carga horária do curso pode vir de 'curso.carga_horaria' (string "50h") ou soma das matérias
        // Vamos tentar usar a soma das matérias se curso.carga_horaria for vazio ou inconsistente

        let courseTarget = 0;
        if (curso.carga_horaria) {
            // Tentar extrair número da string "50h"
            const match = curso.carga_horaria.toString().match(/(\d+)/);
            if (match) {
                courseTarget = parseInt(match[1], 10);
            }
        }

        // Se não conseguiu parsear, usa soma das matérias
        if (!courseTarget) {
            courseTarget = subjectsProgress.reduce((acc, s) => acc + s.targetHours, 0);
        }

        const courseCompleted = subjectsProgress.reduce((acc, s) => acc + s.completedHours, 0);

        // Extract planned from display string: "10h/10h" -> 10.
        const coursePlanned = subjectsProgress.reduce((acc, s) => {
            const val = parseInt(s.displayPlanned.split('h')[0]) || 0;
            return acc + val;
        }, 0);

        const coursePercentage = courseTarget > 0 ? Math.round((courseCompleted / courseTarget) * 100) : 0;

        return {
            courseId: curso.id,
            courseName: curso.nome,
            targetHours: courseTarget,
            completedHours: courseCompleted,
            plannedHours: coursePlanned,
            percentage: coursePercentage,
            isCompleted: courseCompleted >= courseTarget && courseTarget > 0,
            display: `${courseCompleted}h/${courseTarget}h`,
            displayPlanned: `${coursePlanned}h/${courseTarget}h`,
            subjects: subjectsProgress
        };
    }
};
