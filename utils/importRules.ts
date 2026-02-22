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
        if (!row.numeroCurso && !row.nomeCurso) {
            errors.push('Linha sem identificação de curso (Nome ou Número).');
            isValid = false;
        }

        // 2. Course Identification Logic
        if (isValid) {
            if (row.numeroCurso) {
                // A. Check Consistency within file
                if (fileCourses.has(row.numeroCurso)) {
                    const prev = fileCourses.get(row.numeroCurso)!;

                    if (row.cargaHorariaCurso && row.cargaHorariaCurso !== prev.carga) {
                        errors.push(`Inconsistência: Carga horária (${row.cargaHorariaCurso}) difere da anterior (${prev.carga}) para este número.`);
                        isValid = false;
                    }
                    if (row.tipoHora && row.tipoHora !== prev.tipo) {
                        errors.push(`Inconsistência: Tipo de hora (${row.tipoHora}) difere da anterior (${prev.tipo}) para este número.`);
                        isValid = false;
                    }
                } else if (row.cargaHorariaCurso || row.tipoHora || row.nomeCurso) {
                    fileCourses.set(row.numeroCurso, {
                        carga: row.cargaHorariaCurso || '',
                        tipo: row.tipoHora || 60,
                        nome: row.nomeCurso || ''
                    });
                }

                // B. Check against Database
                const existing = existingCourses.find(c => c.numeroCurso === row.numeroCurso);
                if (existing) {
                    courseAction = 'reuse';
                    courseId = existing.id;
                } else {
                    courseAction = 'create';
                }

            } else {
                errors.push('Aviso: Curso identificado apenas por nome (sem número externo).');
                const existing = existingCourses.find(c => c.nome.toLowerCase() === row.nomeCurso?.toLowerCase());
                if (existing) {
                    courseAction = 'reuse';
                    courseId = existing.id;
                } else {
                    courseAction = 'create';
                }
            }
        }

        // 3. Instructor Validation (New)
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

    // Excel Number (Fraction of day, e.g. 0.33333 = 08:00)
    if (typeof timeVal === 'number') {
        // Handle integers as hours ?? No, usually Excel time is 0-1.
        // Exception: 8 might mean 08:00? Unlikely in standard Excel, usually 8.0/24
        // But let's assume it's standard Excel OLE Automation Date/Time fraction
        const totalSeconds = Math.round(timeVal * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const timeStr = String(timeVal).trim();

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
