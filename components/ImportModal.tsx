import React, { useState } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { processImportData, ProcessedRow, RawImportRow, normalizeDate, normalizeTime } from '../utils/importRules';

// Extend ProcessedRow locally if needed or just use loose typing for AI
interface AIInsight {
    rowId: number;
    severity: 'high' | 'medium' | 'low';
    message: string;
}
import * as XLSX from 'xlsx';
import { auditService } from '../services';
import { supabase } from '../lib/supabase';
import { runImportTransaction } from '../utils/importTransactionHelper';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose }) => {
    const {
        cursos, materias, instrutores,
        addCurso, addMateria, addAula,
        isActionLoading
    } = useSchedule();

    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ProcessedRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [step, setStep] = useState<'upload' | 'preview'>('upload');
    const [stats, setStats] = useState({ success: 0, errors: 0 });

    const [importMode, setImportMode] = useState<'course' | 'schedule'>('course');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiInsights, setAiInsights] = useState<Map<number, AIInsight[]>>(new Map());

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);

            try {
                if (selectedFile.name.endsWith('.csv')) {
                    await parseCSV(selectedFile);
                } else if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
                    await parseExcel(selectedFile);
                } else {
                    setError('Formato não suportado. Use CSV ou Excel (.xlsx).');
                }
            } catch (err) {
                console.error(err);
                setError('Erro ao processar arquivo.');
            }
        }
    };

    const parseExcel = async (file: File) => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 2) {
            setError('Arquivo vazio ou sem cabeçalho.');
            return;
        }

        const headers = jsonData[0].map((h: any) => String(h).trim().toLowerCase());
        processHeadersAndData(headers, jsonData.slice(1));
    };

    const parseCSV = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

            const data = lines.slice(1).filter(l => l.trim()).map(line => {
                // Handle simple CSV parsing (warning: breaks on commas in quotes)
                // For better usage, we'd use a CSV lib, but let's assume simple CSV for legacy compatibility
                return line.split(',').map(c => c.trim());
            });

            processHeadersAndData(headers, data);
        };
        reader.readAsText(file);
    };

    const processHeadersAndData = (headers: string[], rows: any[][]) => {
        console.log('Processing Headers:', headers);

        // Mode logic
        const hasDate = headers.some(h => normalizeString(h).includes('data'));
        const hasDisciplina = headers.some(h => normalizeString(h).includes('disciplina') || normalizeString(h).includes('materia'));
        setImportMode((hasDate && hasDisciplina) ? 'schedule' : 'course');

        // 1. Agressive Normalization Function
        function normalizeString(str: string) {
            if (!str) return '';
            return str
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '') // Manter apenas letras e números, removendo espaços
                .trim();
        }

        // 2. Equivalency Dictionary
        const headerDictionary: Record<string, string[]> = {
            numeroCurso: ['numero do curso', 'turma', 'codigo do curso', 'codigo turma', 'numero', 'codigo', 'cod', 'cod turma', 'no turma', 'nº turma'],
            nomeCurso: ['nome do curso', 'curso', 'titulo do curso', 'nome'],
            cargaCurso: ['carga curso', 'carga horaria curso', 'carga total', 'horas curso', 'carga'],
            tipoHora: ['tipo hora', 'tipo de hora', 'modalidade hora', 'minutos', 'tipo'],
            cor: ['cor', 'cor do curso', 'cor agenda'],
            materia: ['materia', 'disciplina', 'conteudo', 'modulo'],
            cargaMateria: ['carga materia', 'carga disciplina', 'carga modulo', 'carga horaria disciplina', 'carga horaria materia', 'horas materia', 'horas disciplina', 'ch materia', 'carga mat', 'ch mat', 'horas mat', 'cargamat', 'cargamateria'],
            data: ['data', 'dia', 'data aula'],
            horarioInicio: ['horario inicio', 'inicio', 'hora inicio', 'hora inicial', 'start'],
            horarioFim: ['horario fim', 'fim', 'hora fim', 'hora final', 'end'],
            instrutor: ['instrutor', 'docente', 'professor', 'facilitador'],
            sala: ['sala', 'local', 'sala aula', 'ambiente']
        };

        // 3. Build Reverse Lookup Map
        const normalizedDict = new Map<string, string>();
        for (const [canonicalKey, synonyms] of Object.entries(headerDictionary)) {
            for (const synonym of synonyms) {
                normalizedDict.set(normalizeString(synonym), canonicalKey);
            }
        }

        // 4. Parse Headers deterministically (Left-to-Right)
        const mappedColumns = new Map<string, number>(); // canonicalKey -> original columnIndex
        const recognizedHeaders: string[] = [];
        const ignoredHeaders: string[] = [];

        headers.forEach((header, index) => {
            const normH = normalizeString(header);
            const canonicalKey = normalizedDict.get(normH);

            if (canonicalKey) {
                if (mappedColumns.has(canonicalKey)) {
                    console.warn(`[Import Aviso] Coluna '${header}' (índice ${index}) também mapeia para o campo '${canonicalKey}', mas a coluna no índice ${mappedColumns.get(canonicalKey)} já assumiu esse campo primeiro. Ignorando silenciosamente.`);
                    ignoredHeaders.push(header);
                } else {
                    mappedColumns.set(canonicalKey, index);
                    recognizedHeaders.push(header);
                }
            } else {
                ignoredHeaders.push(header);
            }
        });

        // 5. Parse Data Rows
        let discardedCount = 0;
        const rawData: RawImportRow[] = rows.map((row, index) => {
            const getVal = (canonicalKey: string) => {
                const colIndex = mappedColumns.get(canonicalKey);
                if (colIndex !== undefined && row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
                    return String(row[colIndex]).trim();
                }
                return undefined;
            };

            const nome = getVal('nomeCurso');
            const num = getVal('numeroCurso');

            // Validação mínima da linha
            if (!nome && !num) {
                discardedCount++;
                return null;
            }

            return {
                originalLine: index + 2,
                numeroCurso: num,
                nomeCurso: nome,
                numeroTurma: num, // Duplicamos interno pra compatibilidade com importRules
                disciplina: getVal('materia'),
                data: normalizeDate(getVal('data') || ''),
                horarioInicio: normalizeTime(getVal('horarioInicio')),
                horarioFim: normalizeTime(getVal('horarioFim')),
                instrutor: getVal('instrutor'),
                cargaHorariaCurso: getVal('cargaCurso'),
                cargaHorariaMateria: getVal('cargaMateria'),
                tipoHora: getVal('tipoHora')?.includes('50') ? 50 : 60,
                cor: getVal('cor'),
                sala: getVal('sala')
            };
        }).filter(Boolean) as RawImportRow[];

        // 6. Log Console Table Report
        console.table({
            'Colunas Reconhecidas': recognizedHeaders.length,
            'Colunas Ignoradas': ignoredHeaders.length,
            'Linhas Válidas Mapeadas': rawData.length,
            'Linhas Descartadas (Vazias)': discardedCount
        });
        console.log('Reconhecidas detalhe:', recognizedHeaders);
        console.log('Ignoradas detalhe:', ignoredHeaders);

        const processed = processImportData(rawData, cursos, instrutores);
        setPreview(processed);

        if (processed.length === 0 && rows.length > 0) {
            setError('Nenhum registro válido identificado. Verifique se os cabeçalhos do arquivo correspondem ao modelo (Ex: "Número do Curso", "Nome do Curso", "Disciplina").');
        } else {
            setStep('preview');
        }
    };

    const handleAIAudit = async () => {
        if (!preview.length) return;
        setAiLoading(true);
        setAiInsights(new Map());

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const headers: HeadersInit = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/audit', {
                method: 'POST',
                headers,
                body: JSON.stringify({ rows: preview })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) throw new Error('Sessão expirada. Faça login novamente.');
                if (response.status === 404) throw new Error('Serviço de IA indisponível localmente (use Vercel Dev ou Produção).');
                throw new Error(data.details || data.error || 'Falha na auditoria de IA.');
            }

            if (data.insights) {
                const map = new Map<number, AIInsight[]>();
                data.insights.forEach((insight: any) => {
                    const existing = map.get(insight.rowId) || [];
                    existing.push(insight);
                    map.set(insight.rowId, existing);
                });
                setAiInsights(map);

                if (data.insights.length === 0) {
                    alert('✨ Auditoria concluída: Nenhum problema encontrado pela IA!');
                }
            }
        } catch (err: any) {
            console.error(err);
            alert(`Erro na auditoria: ${err.message}`);
        } finally {
            setAiLoading(false);
        }
    };

    const handleImport = async () => {
        await executeImportBatch();
    };

    const executeImportBatch = async () => {
        setIsImporting(true); // Ensure loading state
        let successCount = 0;
        let errorCount = 0;
        const rowErrors: string[] = [];

        // We will do this sequentially to ensure IDs are available
        const { cursoService, materiaService, aulaService, authService } = await import('../services');
        // Import omitted due to top-level

        const currentUser = await authService.getCurrentUser();
        if (!currentUser) {
            alert('Erro de sessão: Faça login novamente.');
            setIsImporting(false);
            return;
        }

        // 1. Identify distinct new courses and create them
        const uniqueNewCourses = new Map<string, RawImportRow>();
        preview.forEach(row => {
            if (row.courseAction === 'create' && row.numeroTurma) {
                if (!uniqueNewCourses.has(row.numeroTurma)) uniqueNewCourses.set(row.numeroTurma, row);
            } else if (row.courseAction === 'create' && row.nomeCurso) {
                // Fallback name
                if (!uniqueNewCourses.has(row.nomeCurso)) uniqueNewCourses.set(row.nomeCurso, row);
            }
        });

        // Map: Key (Numero OR Nome) -> UUID
        const courseIdMap = new Map<string, string>();

        // Pre-fill with existing
        cursos.forEach(c => {
            if (c.numeroCurso) courseIdMap.set(c.numeroCurso, c.id);
            courseIdMap.set(c.nome, c.id);
        });

        // Create new Courses
        for (const [key, row] of uniqueNewCourses.entries()) {
            if (courseIdMap.has(key)) continue;

            const res = await cursoService.create({
                nome: row.nomeCurso || 'Novo Curso',
                numero_curso: row.numeroTurma,
                carga_horaria: row.cargaHorariaCurso ? Number(String(row.cargaHorariaCurso).replace(/\D/g, '')) : undefined,
                minutos_por_hora: row.tipoHora,
                cor: row.cor || '#3b82f6',
                status: 'ativo'
            });

            if (res.success && res.data) {
                const created = res.data as any;
                if (created.id) {
                    courseIdMap.set(key, created.id);

                    auditService.log({
                        action: 'IMPORT',
                        entity: `Curso: ${row.numeroTurma || row.nomeCurso}`,
                        details: { message: `Created via Import. Key: ${key}` },
                        result: 'success'
                    });
                }
            } else {
                console.error('Falha ao criar curso base:', res.error);
                errorCount++;
                rowErrors.push(`Erro fatal ao criar curso base: ${row.numeroTurma || row.nomeCurso}`);
            }
        }

        // 2. Process Rows per Course (Grouping for Transactions)
        const coursesToProcess = new Map<string, ProcessedRow[]>(); // Key: courseId

        for (const row of preview) {
            if (!row.isValid) continue;

            let cId = courseIdMap.get(row.numeroTurma || '') || courseIdMap.get(row.nomeCurso || '');
            if (!cId && row.courseId) cId = row.courseId; // From validation step

            if (!cId) {
                console.error('Failed to resolve Course ID for row', row);
                errorCount++;
                rowErrors.push(`Linha ${(row.originalLine || '?')}: Curso não resolvido.`);
                continue;
            }

            const courseRows = coursesToProcess.get(cId) || [];
            courseRows.push(row);
            coursesToProcess.set(cId, courseRows);
        }

        // 3. Execute logic per course group
        for (const [courseId, rows] of coursesToProcess.entries()) {
            try {
                const isExistingCourse = cursos.some(c => c.id === courseId);
                const firstRow = rows[0];

                if (importMode === 'schedule') {
                    if (isExistingCourse) {
                        // --- TRANSACTIONAL UPDATE FOR EXISITING COURSES ---
                        // Build the payload for RPC
                        const materiasPayloadMap = new Map<string, any>();

                        // Aggregate all unique subjects
                        rows.forEach(r => {
                            if (r.disciplina && !materiasPayloadMap.has(r.disciplina)) {
                                materiasPayloadMap.set(r.disciplina, {
                                    id: crypto.randomUUID(),
                                    nome: r.disciplina,
                                    carga_horaria: r.cargaHorariaMateria ? Number(String(r.cargaHorariaMateria).replace(/\D/g, '')) : null
                                });
                            }
                        });
                        const p_materia_insertions = Array.from(materiasPayloadMap.values());

                        // Build Aulas Payload
                        const p_aula_insertions = rows.map(r => {
                            const searchName = r.instrutor?.toLowerCase().trim();
                            let instrutorObj = instrutores.find(i => i.nome.toLowerCase() === searchName);
                            if (!instrutorObj && searchName) {
                                const partials = instrutores.filter(i => i.nome.toLowerCase().includes(searchName));
                                if (partials.length === 1) instrutorObj = partials[0];
                            }

                            return {
                                id: crypto.randomUUID(),
                                materia_id: materiasPayloadMap.get(r.disciplina)?.id,
                                materia_nome: r.disciplina,
                                instrutor_id: instrutorObj?.id || null,
                                numero_turma: r.numeroTurma,
                                data: r.data,
                                horario_inicio: r.horarioInicio,
                                horario_fim: r.horarioFim,
                                carga_horaria_materia: r.cargaHorariaMateria ? Number(String(r.cargaHorariaMateria).replace(/\D/g, '')) : null,
                                sala: r.sala || null
                            };
                        }).filter(a => a.data && a.horario_inicio && a.horario_fim);

                        // Execute Atomic Transaction
                        const transactionResult = await runImportTransaction({
                            p_course_id: courseId,
                            p_course_data: { nome: firstRow.nomeCurso, numero_curso: firstRow.numeroCurso || null }, // Fallback info
                            p_materias_data: p_materia_insertions,
                            p_aulas_data: p_aula_insertions,
                            p_user_id: currentUser.id,
                            p_tenant_id: currentUser.tenant_id
                        });

                        if (transactionResult.success) {
                            successCount += rows.length;
                            auditService.log({
                                action: 'IMPORT',
                                entity: `Curso: ${courseId}`,
                                details: { message: `Transação atômica concluída com snapshot. Aulas processadas: ${rows.length}` },
                                result: 'success'
                            });
                        } else {
                            errorCount += rows.length;
                            let friendlyError = transactionResult.error;
                            if (friendlyError?.includes('idx_unique_instrutor_horario')) {
                                friendlyError = 'O instrutor fornecido já está agendado nesse mesmo dia e horário em outro curso (Conflito de Agenda).';
                            } else if (friendlyError?.includes('uniq_numero_curso_tenant')) {
                                friendlyError = 'O código da turma ou curso preenchido já está sendo usado por um curso diferente.';
                            } else if (friendlyError?.includes('invalid input syntax for type time')) {
                                friendlyError = 'A formatação dos horários na planilha (Início/Fim) é inválida. Use o formato HH:MM (ex: 14:30).';
                            }
                            rowErrors.push(`Erro ao atualizar turma "${firstRow.numeroTurma || firstRow.nomeCurso}": ${friendlyError} (As aulas anteriores desta turma foram preservadas).`);
                            console.error('Transaction failed for course:', courseId, transactionResult.error);
                        }

                    } else {
                        // --- STANDARD (NON-ATOMIC) CREATION FOR BRAND NEW COURSES ---
                        // No snapshot needed because there's nothing to lose.
                        let groupSuccess = 0;
                        let groupError = 0;

                        for (const row of rows) {
                            let mId = '';
                            if (row.disciplina) {
                                const { data: matData } = await supabase.from('materias').select('id').eq('curso_id', courseId).ilike('nome', row.disciplina).single();
                                if (!matData) {
                                    const res = await materiaService.create({
                                        nome: row.disciplina,
                                        curso_id: courseId,
                                        carga_horaria: row.cargaHorariaMateria ? Number(String(row.cargaHorariaMateria).replace(/\D/g, '')) : undefined
                                    });
                                    if (res.success && res.data) { mId = (res.data as any).id; }
                                } else {
                                    mId = matData.id;
                                }
                            }

                            if (row.data && row.horarioInicio && row.horarioFim) {
                                const searchName = row.instrutor?.toLowerCase().trim();
                                let instrutorObj = instrutores.find(i => i.nome.toLowerCase() === searchName);
                                if (!instrutorObj && searchName) {
                                    const partials = instrutores.filter(i => i.nome.toLowerCase().includes(searchName));
                                    if (partials.length === 1) instrutorObj = partials[0];
                                }

                                const aulaPayload: any = {
                                    data: row.data,
                                    horario_inicio: row.horarioInicio,
                                    horario_fim: row.horarioFim,
                                    curso_id: courseId,
                                    materia_id: mId || undefined,
                                    instrutor_id: instrutorObj?.id,
                                    sala: row.sala,
                                    status: 'agendada',
                                    carga_horaria_materia: row.cargaHorariaMateria ? Number(String(row.cargaHorariaMateria).replace(/\D/g, '')) : undefined,
                                    numero_turma: row.numeroTurma
                                };

                                const aulaResult = await aulaService.create(aulaPayload, true); // force create because it's a new course mapping
                                if (aulaResult.success) {
                                    groupSuccess++;
                                } else {
                                    groupError++;
                                    let friendlyError = aulaResult.error || aulaResult.warning || 'Erro desconhecido';
                                    if (friendlyError?.includes('idx_unique_instrutor_horario')) {
                                        friendlyError = 'O instrutor já está agendado nesse mesmo dia e horário em outro curso (Conflito de Agenda).';
                                    } else if (friendlyError?.includes('invalid input syntax for type time')) {
                                        friendlyError = 'A formatação dos horários na planilha (Início/Fim) é inválida. Use o formato HH:MM (ex: 14:30).';
                                    }
                                    rowErrors.push(`Linha ${(row.originalLine || '?')}: ${friendlyError}`);
                                }
                            }
                        }
                        successCount += groupSuccess;
                        errorCount += groupError;
                    }

                } else {
                    // Course-only mode
                    successCount += rows.length;
                }

            } catch (e: any) {
                console.error('Group processing error for course:', courseId, e);
                errorCount += rows.length;
                rowErrors.push(`Erro de processamento no grupo (Turma ${rows[0]?.numeroTurma}): ${e.message}`);
            }
        }

        setIsImporting(false);
        setStats({ success: successCount, errors: errorCount });

        if (errorCount === 0) {
            alert('Importação concluída com sucesso!');
            window.location.reload();
        } else {
            console.warn('Import completed with errors:', errorCount);

            const maxErrorsToShow = 5;
            const shownErrors = rowErrors.slice(0, maxErrorsToShow);
            const remaining = rowErrors.length - maxErrorsToShow;

            let errorMsg = `Importação concluída com ${errorCount} erro(s).\n\nDetalhes:\n${shownErrors.join('\n')}`;
            if (remaining > 0) errorMsg += `\n...e mais ${remaining} erros.`;

            alert(errorMsg);
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-indigo-50 dark:bg-slate-700 dark:border-slate-600">
                    <h2 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                        <div className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded uppercase tracking-widest font-black">Motor</div>
                        Importar {importMode === 'schedule' ? 'Cronograma' : 'Cursos'}
                    </h2>
                    <button onClick={onClose} className="text-[10px] font-black text-gray-400 hover:text-black uppercase tracking-widest transition-colors dark:hover:text-gray-200">
                        Fechar [X]
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    {step === 'upload' ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-12 bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700">
                            <div className="text-[14px] font-black text-gray-400 mb-4 uppercase tracking-[0.2em] border-2 border-gray-200 px-4 py-2 rounded">
                                [ ARQUIVO ]
                            </div>
                            <p className="text-gray-600 mb-2 font-black uppercase tracking-widest text-[10px] dark:text-gray-400">Arraste seu arquivo Excel (.xlsx) ou CSV</p>

                            <div className="space-y-2 text-center mb-6">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest opacity-70">Estrutura Sugerida:</p>
                                <code className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded block text-gray-500 font-black dark:bg-slate-800 dark:border-slate-700">
                                    NUMERO DO CURSO, NOME DO CURSO, MATÉRIA, DATA, INÍCIO, FIM, INSTRUTOR
                                </code>
                            </div>

                            <label className="px-8 py-3 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 transition shadow-sm font-black text-[10px] uppercase tracking-widest">
                                SELECIONAR ARQUIVO LOCAL
                                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                            </label>

                            <button
                                onClick={() => {
                                    const csvContent = 'Numero do Curso,Nome do Curso,Carga Curso,Tipo Hora,Cor,Matéria,Carga Matéria,Data,Horario Inicio,Horario Fim,Instrutor,Sala\n1001,Curso Exemplo,20,60,#3b82f6,Matemática,10,2026-01-25,08:00,10:00,Instrutor Exemplo,Sala 1';
                                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(blob);
                                    link.download = 'modelo_importacao.csv';
                                    link.click();
                                }}
                                className="mt-4 text-[10px] font-black text-indigo-600 hover:text-indigo-800 underline uppercase tracking-widest dark:text-indigo-400"
                            >
                                Baixar Modelo (.CSV)
                            </button>

                            {error && (
                                <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 p-4 border border-red-200 rounded-lg text-[10px] font-black uppercase tracking-widest dark:bg-red-900/10 dark:border-red-900/30">
                                    [ ! ] ERRO: {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-800">
                                    Pré-visualização ({importMode === 'schedule' ? 'Cronograma' : 'Cursos'})
                                </h3>
                                <div className="flex gap-2">
                                    <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
                                        {preview.filter(p => p.courseAction === 'create').length} Novos Cursos
                                    </span>
                                    <span className="text-xs px-2 py-1 rounded bg-green-50 text-green-700">
                                        {preview.filter(p => p.courseAction === 'reuse').length} Existentes
                                    </span>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-lg overflow-auto max-h-[500px]">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-3 font-medium">Status</th>
                                            <th className="p-3 font-medium">Nº Curso</th>
                                            <th className="p-3 font-medium">Nome</th>
                                            <th className="p-3 font-medium">Cor</th>
                                            <th className="p-3 font-medium">Carga (Curso)</th>
                                            {importMode === 'schedule' && (
                                                <>
                                                    <th className="p-3 font-medium">Matéria</th>
                                                    <th className="p-3 font-medium">Carga (Mat.)</th>
                                                    <th className="p-3 font-medium">Data</th>
                                                    <th className="p-3 font-medium">Horário</th>
                                                </>
                                            )}
                                            <th className="p-3 font-medium">Mensagem</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {preview.map((row, i) => (
                                            <tr key={i} className={!row.isValid ? 'bg-red-50' : row.courseAction === 'create' ? 'bg-blue-50/30' : ''}>
                                                <td className="p-3">
                                                    {row.isValid
                                                        ? <div className="text-[10px] font-black text-emerald-600 uppercase">OK</div>
                                                        : <div className="text-[10px] font-black text-rose-600 uppercase">ERR</div>
                                                    }
                                                </td>
                                                <td className="p-3 font-mono text-xs">{row.numeroCurso || '-'}</td>
                                                <td className="p-3 max-w-[200px] truncate" title={row.nomeCurso}>{row.nomeCurso}</td>
                                                <td className="p-3">
                                                    {row.cor && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: row.cor }}></div>}
                                                </td>
                                                <td className="p-3">{row.cargaHorariaCurso || '-'}</td>
                                                {importMode === 'schedule' && (
                                                    <>
                                                        <td className="p-3">{row.disciplina || '-'}</td>
                                                        <td className="p-3">{row.cargaHorariaMateria || '-'}</td>
                                                        <td className="p-3">{row.data || '-'}</td>
                                                        <td className="p-3">{row.horarioInicio ? `${row.horarioInicio} - ${row.horarioFim}` : '-'}</td>
                                                    </>
                                                )}
                                                <td className="p-3 text-xs text-gray-500">
                                                    {row.courseAction === 'create' ? <span className="text-blue-600">Novo Curso</span> : <span className="text-gray-400">Reutilizar</span>}
                                                    {row.validationErrors.map((e, idx) => (
                                                        <div key={idx} className="text-red-600 mt-1 block">• {e}</div>
                                                    ))}
                                                    {(aiInsights.get(row.originalLine) || []).map((insight, idx) => (
                                                        <div key={`ai-${idx}`} className={`mt-1 block text-xs flex items-start gap-1 font-medium ${insight.severity === 'high' ? 'text-red-600' : 'text-amber-600'
                                                            }`}>
                                                            [ INFO ] {insight.message}
                                                        </div>
                                                    ))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                        onClick={() => { setStep('upload'); setFile(null); setPreview([]); }}
                        className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600"
                    >
                        [ VOLTAR ]
                    </button>
                    {step === 'preview' && (
                        <>
                            <button
                                onClick={handleAIAudit}
                                disabled={aiLoading || isImporting}
                                className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-2 transition dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50"
                            >
                                {aiLoading ? 'ANALISANDO...' : 'AUDITAR COM IA'}
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={isImporting || preview.filter(r => r.isValid).length === 0}
                                className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2 transition disabled:opacity-50"
                            >
                                {isImporting ? 'PROCESSANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
};

