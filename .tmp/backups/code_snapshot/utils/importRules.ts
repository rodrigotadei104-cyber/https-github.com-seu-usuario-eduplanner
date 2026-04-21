import { Curso } from '../types';

export interface RawImportRow {
    originalLine: number;
    numeroCurso?: string;
    nomeCurso?: string;
    disciplina?: string;
    data?: string; // YYYY-MM-DD
    horarioInicio?: string;
    horarioFim?: string;
    instrutor?: string;
    cargaHorariaCurso?: string;
    tipoHora?: number; // 50 or 60
    cor?: string;
    sala?: string;
    cargaHorariaMateria?: string;
    numeroTurma?: string; // New: Distinct Class ID
}

export interface ProcessedRow extends RawImportRow {
    isValid: boolean;
    validationErrors: string[];
    courseAction: 'reuse' | 'create' | 'none';
    courseId?: string; // If reuse
    status: 'ready' | 'error' | 'warning';
}

/**
 * Normalizes and validates the imported data.
 * Enforces rules:
 * 1. numero_curso consistency (must have same load/type if repeated).
 * 2. numero_curso priority over matching by name.
 */
export const processImportData = (
    rawData: RawImportRow[],
    existingCourses: Curso[],
    instrutores: any[] = [] // Default to empty if not passed
): ProcessedRow[] => {
    const processed: ProcessedRow[] = [];

    // Map to track consistency of new courses found in file
    const fileCourses = new Map<string, { carga: string, tipo: number, nome: string }>();

    for (const row of rawData) {
        const errors: string[] = [];
        let isValid = true;
        let courseAction: 'reuse' | 'create' | 'none' = 'none';
        let courseId: string | undefined;

        // 1. Minimum Requirements
        if (!row.numeroTurma && !row.nomeCurso) {
            errors.push('Linha sem identificação de curso (Turma ou Nome).');
            isValid = false;
        }

        // 1.1 Date Validation (Must exist and be valid)
        if (!row.data) {
            errors.push('Data da aula é obrigatória.');
            isValid = false;
        } else {
            const normalized = normalizeDate(row.data);
            if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                errors.push(`Formato de data inválido: ${row.data}`);
                isValid = false;
            } else {
                // Check if it's a real date (e.g. not 2026-02-30)
                const d = new Date(normalized + 'T12:00:00Z');
                if (isNaN(d.getTime())) {
                    errors.push(`Data inválida ou inexistente: ${row.data}`);
                    isValid = false;
                }
            }
        }

        // 2. Course Identification Logic
        // 1. Resolve Course (Create or Reuse)
        const courseIdentifier = row.numeroTurma || row.numeroCurso;

        if (isValid) {
            if (courseIdentifier) {
                // A. Check for internal consistency in the file
                if (fileCourses.has(courseIdentifier)) {
                    const prev = fileCourses.get(courseIdentifier)!;

                    if (row.cargaHorariaCurso && row.cargaHorariaCurso !== prev.carga) {
                        errors.push(`Inconsistência: Carga horária (${row.cargaHorariaCurso}) difere da anterior (${prev.carga}) para a turma ${courseIdentifier}.`);
                        isValid = false;
                    }
                    if (row.tipoHora && row.tipoHora !== prev.tipo) {
                        errors.push(`Inconsistência: Tipo de hora (${row.tipoHora}) difere da anterior (${prev.tipo}) para a turma ${courseIdentifier}.`);
                        isValid = false;
                    }
                } else if (row.cargaHorariaCurso || row.tipoHora || row.nomeCurso) {
                    fileCourses.set(courseIdentifier, {
                        carga: row.cargaHorariaCurso || '',
                        tipo: row.tipoHora || 60,
                        nome: row.nomeCurso || ''
                    });
                }

                // B. Check against Database
                const existing = existingCourses.find(c => c.numeroCurso === courseIdentifier);
                if (existing) {
                    courseAction = 'reuse';
                    courseId = existing.id;
                } else {
                    courseAction = 'create';
                }

            } else {
                errors.push('Aviso: Curso identificado apenas por nome (sem identificador de turma externo).');
                const existing = existingCourses.find(c => c.nome.toLowerCase() === row.nomeCurso?.toLowerCase());
                if (existing) {
                    courseAction = 'reuse';
                    courseId = existing.id;
                } else {
                    courseAction = 'create';
                }
            }
        }

        // 3. Instructor Validation
        if (isValid && row.instrutor) {
            // If instructor is provided, it MUST exist in the system
            const searchName = row.instrutor.trim().toLowerCase();
            const exists = instrutores.some(i => i.nome.toLowerCase() === searchName) ||
                instrutores.some(i => i.nome.toLowerCase().includes(searchName)); // Loose match allowed for import convenience

            if (!exists) {
                errors.push(`Instrutor não encontrado: "${row.instrutor}". Cadastre-o antes ou deixe em branco.`);
                isValid = false;
            }
        }

        processed.push({
            ...row,
            data: normalizeDate(row.data) || row.data, // Ensure data is normalized in output
            isValid: isValid,
            validationErrors: errors,
            courseAction,
            courseId,
            status: isValid ? (errors.length > 0 ? 'warning' : 'ready') : 'error'
        });
    }

    return processed;
};

export const normalizeDate = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;

    // Check if ALREADY YYYY-MM-DD (Simple regex)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Check if DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    // Check if M/D/YYYY (Excel sometimes e.g. 1/25/2026)
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }

    // Check for Excel Serial Number (e.g. "46047")
    const serial = Number(dateStr);
    if (!isNaN(serial) && serial > 35000 && serial < 60000) {
        // Excel base: Dec 30 1899 usually (Unix epoch 25569)
        // 25569 days offset between Excel (1900-01-01 is 1) and Unix (1970-01-01)
        // Correction: Excel leap year bug 1900 makes it confusing, but usually (Serial - 25569) * 86400 * 1000
        const date = new Date((serial - 25569) * 86400 * 1000);
        // Add roughly 1 day (GMT vs Local issues) - Safe bet is generic UTC parts
        // Actually, let's play safe with simple math
        const utcDate = new Date((serial - 25569) * 86400 * 1000 + (12 * 3600 * 1000)); // Add 12h to be safe middle of day
        const y = utcDate.toISOString().split('T')[0];
        return y;
    }

    return dateStr;
};

export const normalizeTime = (timeVal?: string | number): string | undefined => {
    if (timeVal === undefined || timeVal === null || timeVal === '') return undefined;

    const timeStr = String(timeVal).trim();

    // Excel Number (Fraction of day, e.g. 0.33333 = 08:00 or "0.3125" = 07:30)
    // Se for numero ou um texto convertivel para numero e menor que 1 (fração do dia)
    const timeNum = Number(timeStr);
    if (!isNaN(timeNum) && timeNum >= 0 && timeNum < 1) {
        const totalSeconds = Math.round(timeNum * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // HH:MM
    if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        return timeStr.padStart(5, '0'); // 8:00 -> 08:00
    }

    // HH:MM:SS
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
        return timeStr.substring(0, 5).padStart(5, '0');
    }

    return timeStr;
};
