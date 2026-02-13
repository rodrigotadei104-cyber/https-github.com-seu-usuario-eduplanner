import React, { useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle, FileText, Loader2, XCircle, Calendar, HelpCircle, Sparkles } from 'lucide-react';
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
        // Detect Mode based on headers
        const hasDate = headers.some(h => h.includes('data'));
        const hasDisciplina = headers.some(h => h.includes('disciplina') || h.includes('matéria'));
        const mode = (hasDate && hasDisciplina) ? 'schedule' : 'course';
        setImportMode(mode);

        // Aggressive Normalization Helper
        const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedHeaders = headers.map(normalizeKey);

        const rawData: RawImportRow[] = rows.map((row, index) => {
            const mapVal = (searchKeys: string[]) => {
                // Check against normalized headers
                const searchNormalized = searchKeys.map(normalizeKey);
                const idx = normalizedHeaders.findIndex(h => searchNormalized.some(sk => h.includes(sk)));
                // Return RAW value if found
                return idx >= 0 ? row[idx] : undefined;
            };

            // Remove empty rows
            const nomeStr = mapVal(['nome']); // Removed 'curso' to avoid matching 'numero do curso'
            const nome = nomeStr ? String(nomeStr).trim() : undefined;

            const numStr = mapVal(['numero', 'código', 'codigo', 'cod']);

            if (!nome && !numStr) return null;

            return {
                originalLine: index + 2,
                numeroCurso: numStr ? String(numStr).trim() : undefined,
                nomeCurso: nome,
                disciplina: mapVal(['disciplina', 'matéria', 'materia']) ? String(mapVal(['disciplina', 'matéria', 'materia'])).trim() : undefined,
                data: normalizeDate(String(mapVal(['data']))),
                horarioInicio: normalizeTime(mapVal(['início', 'inicio', 'start'])),
                horarioFim: normalizeTime(mapVal(['fim', 'end'])),
                instrutor: mapVal(['instrutor', 'professor']) ? String(mapVal(['instrutor', 'professor'])).trim() : undefined,
                // Expanded keys to catch variations like "Carga Horária (Curso)"
                cargaHorariaCurso: mapVal(['carga_curso', 'horas_curso', 'carga curso', 'horas curso', 'carga horaria curso', 'ch curso', 'carga horaria', 'carga']) ? String(mapVal(['carga_curso', 'horas_curso', 'carga curso', 'horas curso', 'carga horaria curso', 'ch curso', 'carga horaria', 'carga'])) : undefined,
                // Simplify logic: if header has 'materia' or 'disciplina' AND 'carga'/'horas'
                cargaHorariaMateria: mapVal(['carga_materia', 'horas_materia', 'carga_disciplina', 'horas_disciplina', 'carga disciplina', 'carga horaria disciplina', 'carga horaria materia', 'ch materia', 'carga mat', 'ch mat', 'horas mat', 'cargamat', 'cargamateria']) ? String(mapVal(['carga_materia', 'horas_materia', 'carga_disciplina', 'horas_disciplina', 'carga disciplina', 'carga horaria disciplina', 'carga horaria materia', 'ch materia', 'carga mat', 'ch mat', 'horas mat', 'cargamat', 'cargamateria'])) : undefined,
                tipoHora: String(mapVal(['tipo', 'minutos'])).includes('50') ? 50 : 60,
                cor: mapVal(['cor']) ? String(mapVal(['cor'])) : undefined,
                sala: mapVal(['sala']) ? String(mapVal(['sala'])) : undefined,
                numeroTurma: mapVal(['turma', 'no turma', 'nº turma', 'codigo turma', 'cod turma']) ? String(mapVal(['turma', 'no turma', 'nº turma', 'codigo turma', 'cod turma'])).trim() : undefined
            };
        }).filter(Boolean) as RawImportRow[];

        // Refine Carga Mapping Logic because 'carga' matches both curso and materia
        // Better strategy: Specific keys first
        rawData.forEach(r => {
            // Re-map strictly if needed, but let's trust the normalizeKey finding specific matches first
            // For "Carga Curso", normalizer makes 'cargacurso'. Search key 'cargacurso' works.
        });

        const processed = processImportData(rawData, cursos);
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
        const { cursoService, materiaService, aulaService } = await import('../services');

        // 1. Identify distinct new courses and create them
        const uniqueNewCourses = new Map<string, RawImportRow>();
        preview.forEach(row => {
            if (row.courseAction === 'create' && row.numeroCurso) {
                if (!uniqueNewCourses.has(row.numeroCurso)) uniqueNewCourses.set(row.numeroCurso, row);
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

            // FIX: Type assertion or check
            const res = await cursoService.create({
                nome: row.nomeCurso || 'Novo Curso',
                numero_curso: row.numeroCurso,
                carga_horaria: row.cargaHorariaCurso ? Number(String(row.cargaHorariaCurso).replace(/\D/g, '')) : undefined,
                minutos_por_hora: row.tipoHora,
                cor: row.cor || '#3b82f6',
                status: 'ativo'
            });

            if (res.success && res.data) {
                // FIX: Cast data to any to access id if strictly typed as generic
                const created = res.data as any;
                if (created.id) {
                    courseIdMap.set(key, created.id);

                    auditService.log({
                        action: 'IMPORT',
                        entity: `Curso: ${row.numeroCurso || row.nomeCurso}`,
                        details: { message: `Created via Import. Key: ${key}` },
                        result: 'success'
                    });
                }
            }
        }

        // 2. Process Rows
        for (const row of preview) {
            if (!row.isValid) continue;

            try {
                // Resolve Course ID
                let cId = courseIdMap.get(row.numeroCurso || '') || courseIdMap.get(row.nomeCurso || '');
                if (!cId && row.courseId) cId = row.courseId; // From validation step

                if (!cId) {
                    console.error('Failed to resolve Course ID for row', row);
                    errorCount++;
                    continue; // Skip if no course
                }

                if (importMode === 'schedule') {
                    // Handle Subject (Materia)
                    let mId = '';
                    if (row.disciplina) {
                        // Check if subject exists in THIS course
                        let mat = materias.find(m => m.cursoId === cId && m.nome.toLowerCase() === row.disciplina?.toLowerCase());

                        if (!mat) {
                            // Try to create
                            const res = await materiaService.create({
                                nome: row.disciplina,
                                curso_id: cId,
                                carga_horaria: row.cargaHorariaMateria ? Number(String(row.cargaHorariaMateria).replace(/\D/g, '')) : undefined
                            });

                            if (res.success && res.data) {
                                const createdMateria = res.data as any;
                                mId = createdMateria.id;
                            }
                        } else {
                            mId = mat.id;
                        }
                    }

                    // Create Class (Aula)
                    if (row.data && row.horarioInicio && row.horarioFim) {
                        // ROBUST INSTRUCTOR MAPPING
                        const searchName = row.instrutor?.toLowerCase().trim();
                        let instrutorObj = instrutores.find(i => i.nome.toLowerCase() === searchName);

                        // Fallback: Partial match if unique
                        if (!instrutorObj && searchName) {
                            const partials = instrutores.filter(i => i.nome.toLowerCase().includes(searchName));
                            if (partials.length === 1) instrutorObj = partials[0];
                        }

                        const aulaPayload: any = {
                            data: row.data,
                            horario_inicio: row.horarioInicio,
                            horario_fim: row.horarioFim,
                            curso_id: cId,
                            materia_id: mId || undefined,
                            instrutor_id: instrutorObj?.id,
                            sala: row.sala,
                            status: 'agendada',
                            carga_horaria_materia: row.cargaHorariaMateria ? Number(String(row.cargaHorariaMateria).replace(/\D/g, '')) : undefined,
                            numero_turma: row.numeroTurma
                        };

                        const aulaResult = await aulaService.create(aulaPayload);
                        if (aulaResult.success) {
                            successCount++;
                        } else {
                            console.error('Failed to create aula:', aulaResult.error, row);
                            errorCount++;
                            let msg = aulaResult.error;

                            // Handle Warnings as Errors for Import
                            if (!msg && aulaResult.warning) {
                                if (aulaResult.warning === 'INSTRUCTOR_CONFLICT') {
                                    const conflicts = aulaResult.conflicts || [];
                                    const details = conflicts.map((c: any) => `${c.materia} (${c.horarioInicio}-${c.horarioFim})`).join(', ');
                                    msg = `Conflito de Instrutor: Já possui aula neste horário [${details}]`;
                                } else if (aulaResult.warning === 'ROOM_CONFLICT') {
                                    const conflicts = aulaResult.conflicts || [];
                                    const details = conflicts.map((c: any) => `${c.materia}`).join(', ');
                                    msg = `Conflito de Sala: Sala já ocupada [${details}]`;
                                } else {
                                    msg = `Aviso: ${aulaResult.warning}`;
                                }
                            }

                            msg = msg || 'Erro desconhecido';

                            rowErrors.push(`Linha ${(row.originalLine || '?')}: ${msg}`);
                        }
                    } else {
                        console.warn('Skipping row - missing required fields (data, horarioInicio, horarioFim):', row);
                        errorCount++;
                        rowErrors.push(`Linha ${(row.originalLine || '?')}: Dados incompletos.`);
                    }
                } else {
                    // Course-only mode
                    successCount++;
                }
            } catch (e: any) {
                console.error(e);
                errorCount++;
                const errMsg = e.message || String(e);
                rowErrors.push(`Linha ${(row.originalLine || '?')}: Erro de sistema (${errMsg})`);

                if (errMsg.includes('violates foreign key constraint') || errMsg.includes('column')) {
                    alert(`Erro Crítico no Banco de Dados: ${errMsg}`);
                    setIsImporting(false);
                    return;
                }
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
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Upload className="w-6 h-6 text-blue-600" />
                        Importar {importMode === 'schedule' ? 'Cronograma' : 'Cursos'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    {step === 'upload' ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-12 bg-gray-50">
                            <FileText size={48} className="text-gray-400 mb-4" />
                            <p className="text-gray-600 mb-2 font-medium">Arraste seu arquivo Excel (.xlsx) ou CSV</p>

                            <div className="space-y-2 text-center mb-6">
                                <p className="text-xs text-gray-500">Modo Cronograma (Recomendado):</p>
                                <code className="text-[10px] bg-gray-100 px-2 py-1 rounded block text-gray-500">
                                    Numero do Curso, Nome do Curso, Matéria, Data, Horario Inicio, Horario Fim, Instrutor
                                </code>
                            </div>

                            <label className="px-6 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition shadow-sm font-medium">
                                Selecionar Arquivo
                                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                            </label>

                            <button
                                onClick={() => {
                                    const csvContent = 'Numero do Curso,Nome do Curso,Carga Curso,Tipo Hora,Cor,Matéria,Carga Matéria,Data,Horario Inicio,Horario Fim,Instrutor,Sala\n1001,Curso Exemplo,20,50,#3b82f6,Matemática,10,2026-01-25,08:00,10:00,Joao,Sala 1';
                                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(blob);
                                    link.download = 'modelo_importacao.csv';
                                    link.click();
                                }}
                                className="mt-4 text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                                Baixar Modelo de Exemplo (.csv)
                            </button>

                            {error && (
                                <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                                    <AlertTriangle size={16} />
                                    {error}
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
                                                        ? <CheckCircle size={16} className="text-green-500" />
                                                        : <XCircle size={16} className="text-red-500" />
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
                                                            <Sparkles size={10} className="mt-0.5 flex-shrink-0" /> {insight.message}
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
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Cancelar
                    </button>
                    {step === 'preview' && (
                        <>
                            <button
                                onClick={handleAIAudit}
                                disabled={aiLoading || isImporting}
                                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 flex items-center gap-2"
                            >
                                {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {aiLoading ? 'Analisando...' : 'Auditar com IA'}
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={isImporting || preview.filter(r => r.isValid).length === 0}
                                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {isImporting ? 'Processando...' : 'Confirmar Importação'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
};

