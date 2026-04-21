import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Upload, BookOpen, AlertTriangle, Search, X, ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { CatalogoCurso, DisciplinaCurso } from '../types';
import { catalogoService } from '../services/catalogo.service';
import { useSchedule } from '../context/ScheduleContext';
import { ConfirmationModal } from './ConfirmationModal';
import { auditService } from '../services/audit.service';
import * as XLSX from 'xlsx';

export const CatalogoView: React.FC = () => {
    const { userProfile } = useSchedule();
    const isAdmin = userProfile.role === 'admin';

    const [cursos, setCursos] = useState<CatalogoCurso[]>([]);
    const [disciplinasPorCurso, setDisciplinasPorCurso] = useState<Record<string, DisciplinaCurso[]>>({});
    const [loading, setLoading] = useState(true);
    const [expandedCursoId, setExpandedCursoId] = useState<string | null>(null);

    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Modal States
    const [isCursoModalOpen, setIsCursoModalOpen] = useState(false);
    const [editingCurso, setEditingCurso] = useState<CatalogoCurso | null>(null);
    const [isDisciplinaModalOpen, setIsDisciplinaModalOpen] = useState(false);
    const [editingDisciplina, setEditingDisciplina] = useState<DisciplinaCurso | null>(null);
    const [targetCursoIdParaDisciplina, setTargetCursoIdParaDisciplina] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Delete States
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'curso' | 'disciplina'; id: string }>({ isOpen: false, type: 'curso', id: '' });

    // Forms State
    const [cursoForm, setCursoForm] = useState({ nomeCurso: '', cargaTotalHoras: 0, tipoHoraMin: 60 });
    const [disciplinaForm, setDisciplinaForm] = useState({ nomeDisciplina: '', cargaHoras: 0, tipoDisciplina: 'teorica' as const, ordem: 1 });

    // Migration Modal State
    type MigStatus = 'idle' | 'loading' | 'preview' | 'migrating' | 'done';
    const [migStatus, setMigStatus] = useState<MigStatus>('idle');
    const [migData, setMigData] = useState<{ novos: any[]; duplicatas: any[]; duplicatasInternas: any[]; totalLegado: number; totalLegadoUnico: number } | null>(null);
    const [migResult, setMigResult] = useState<{ importados: number; disciplinasCriadas: number; erros: string[] } | null>(null);
    const [isMigModalOpen, setIsMigModalOpen] = useState(false);

    // Search & Pagination
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const cursosFiltrados = useMemo(() => {
        if (!searchQuery.trim()) return cursos;
        const q = searchQuery.toLowerCase();
        return cursos.filter(c =>
            c.nomeCurso.toLowerCase().includes(q) ||
            String(c.cargaTotalHoras).includes(q)
        );
    }, [cursos, searchQuery]);

    const totalPages = Math.ceil(cursosFiltrados.length / ITEMS_PER_PAGE);
    const cursosNaPagina = cursosFiltrados.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        carregarCursos();
    }, []);

    const carregarCursos = async () => {
        setLoading(true);
        try {
            const data = await catalogoService.getCursos();
            setCursos(data);
        } catch (error) {
            console.error('Erro ao carregar cursos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAbrirMigracao = async () => {
        setIsMigModalOpen(true);
        setMigStatus('loading');
        setMigResult(null);
        try {
            const data = await catalogoService.migrarCursosLegados();
            setMigData(data);
            setMigStatus('preview');
        } catch (err: any) {
            alert('Erro ao analisar cursos legados: ' + err.message);
            setIsMigModalOpen(false);
            setMigStatus('idle');
        }
    };

    const handleConfirmarMigracao = async () => {
        if (!migData || migData.novos.length === 0) return;
        setMigStatus('migrating');
        try {
            const result = await catalogoService.executarMigracaoLegados(migData.novos);
            setMigResult(result);
            setMigStatus('done');
            await carregarCursos(); // Recarregar lista atualizada
        } catch (err: any) {
            alert('Erro durante a migração: ' + err.message);
            setMigStatus('preview');
        }
    };

    const toggleCursoExpanded = async (cursoId: string) => {
        if (expandedCursoId === cursoId) {
            setExpandedCursoId(null);
            return;
        }

        setExpandedCursoId(cursoId);
        if (!disciplinasPorCurso[cursoId]) {
            try {
                const disc = await catalogoService.getDisciplinasPorCurso(cursoId);
                setDisciplinasPorCurso(prev => ({ ...prev, [cursoId]: disc }));
            } catch (error) {
                console.error('Erro ao carregar disciplinas do curso:', error);
            }
        }
    };

    // --- MANEJO DE CURSOS ---
    const handleOpenCursoModal = (curso?: CatalogoCurso) => {
        if (curso) {
            setEditingCurso(curso);
            setCursoForm({ nomeCurso: curso.nomeCurso, cargaTotalHoras: Number(curso.cargaTotalHoras), tipoHoraMin: Number(curso.tipoHoraMin) });
        } else {
            setEditingCurso(null);
            setCursoForm({ nomeCurso: '', cargaTotalHoras: 0, tipoHoraMin: 60 });
        }
        setIsCursoModalOpen(true);
    };

    const handleSaveCurso = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            const payload = {
                nomeCurso: cursoForm.nomeCurso,
                cargaTotalHoras: cursoForm.cargaTotalHoras,
                tipoHoraMin: String(cursoForm.tipoHoraMin),
                ativo: true,
            };
            if (editingCurso) {
                await catalogoService.updateCurso(editingCurso.id, payload);
            } else {
                await catalogoService.createCurso(payload as any);
            }
            setIsCursoModalOpen(false);
            await carregarCursos();
        } catch (error: any) {
            alert('Erro ao salvar o curso: ' + (error?.message || 'Verifique os dados e tente novamente.'));
        } finally {
            setIsSaving(false);
        }
    };

    // --- MANEJO DE DISCIPLINAS ---
    const handleOpenDisciplinaModal = (cursoId: string, disciplina?: DisciplinaCurso) => {
        setTargetCursoIdParaDisciplina(cursoId);
        if (disciplina) {
            setEditingDisciplina(disciplina);
            setDisciplinaForm({ nomeDisciplina: disciplina.nomeDisciplina, cargaHoras: disciplina.cargaHoras, tipoDisciplina: disciplina.tipoDisciplina as any, ordem: disciplina.ordem || 1 });
        } else {
            setEditingDisciplina(null);
            setDisciplinaForm({ nomeDisciplina: '', cargaHoras: 0, tipoDisciplina: 'teorica' as any, ordem: 1 });
        }
        setIsDisciplinaModalOpen(true);
    };

    const handleSaveDisciplina = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetCursoIdParaDisciplina) return;

        try {
            if (editingDisciplina) {
                // Not implemented update in service yet, just simulate or add the method backend later
                alert('Atualização em breve');
            } else {
                await catalogoService.createDisciplina(targetCursoIdParaDisciplina, disciplinaForm);
                // Refresh list
                const dicList = await catalogoService.getDisciplinasPorCurso(targetCursoIdParaDisciplina);
                setDisciplinasPorCurso(prev => ({ ...prev, [targetCursoIdParaDisciplina]: dicList }));
            }
            setIsDisciplinaModalOpen(false);
        } catch (error) {
            alert('Erro ao cadastrar disciplina.');
        }
    };

    const handleDeleteCurso = async () => {
        if (!deleteModal.id || deleteModal.type !== 'curso') return;

        try {
            await catalogoService.deleteCurso(deleteModal.id);
            carregarCursos(); // Refresh
        } catch (error) {
            console.error(error);
            alert('Falha ao excluir o curso. Verifique se existem turmas atreladas.');
        } finally {
            setDeleteModal({ isOpen: false, type: 'curso', id: '' });
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Raw JSON
            const rawJson = XLSX.utils.sheet_to_json<any>(worksheet);

            if (rawJson.length === 0) {
                alert('Planilha vazia.');
                return;
            }

            // Normalizador de chaves flexível (tirando todos os espaços e acentos)
            const normalizeKey = (key: string) => {
                return key.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                    .toUpperCase()
                    .replace(/\s+/g, ""); // Remove TODOS os espaços
            };

            // Agrupador de Cursos
            const cursosMap = new Map<string, any>();
            let ordemFallback = 1;

            rawJson.forEach((row: any) => {
                const normalizedRow: any = {};

                Object.keys(row).forEach(k => {
                    const normK = normalizeKey(k);

                    // Heurística de Busca (se conter as palavras chaves)
                    if (normK.includes('MATRIZ') || normK.includes('CURSO')) {
                        if (!normK.includes('CARGA') && !normK.includes('CH') && !normK.includes('PREVISTA') && !normK.includes('TOTAL')) {
                            normalizedRow.nomeCurso = row[k];
                        }
                    }
                    if (normK.includes('MATERIA') || normK.includes('DISCIPLINA') || normK.includes('BLOCO')) {
                        if (!normK.includes('CARGA') && !normK.includes('CH') && !normK.includes('TIPO') && !normK.includes('PREVISTA')) {
                            normalizedRow.nomeDisciplina = row[k];
                        }
                    }
                    if ((normK.includes('CARGA') || normK.includes('HORA') || normK.includes('CH') || normK.includes('PREVISTA')) && (normK.includes('CURSO') || normK.includes('TOTAL') || normK.includes('PREVISTA'))) {
                        normalizedRow.cargaTotalHoras = row[k];
                    }
                    if ((normK.includes('CARGA') || normK.includes('HORA') || normK.includes('CH')) && (normK.includes('DISCIPLINA') || normK.includes('MATERIA'))) {
                        normalizedRow.cargaHoras = row[k];
                    }
                    // Fallbacks single word
                    if (normK === 'CARGA' || normK === 'CH' || normK === 'HORAS' || normK.includes('PREVISTA')) {
                        if (!normalizedRow.cargaHoras) normalizedRow.cargaHoras = row[k];
                    }
                    if (normK.includes('MINUTOS') || normK.includes('MINHORA')) {
                        normalizedRow.tipoHoraMin = row[k];
                    }
                    if (normK.includes('ORDEM') || normK.includes('SEMESTRE') || normK.includes('PERIODO')) {
                        normalizedRow.ordem = row[k];
                    }
                    if (normK.includes('TIPO')) {
                        normalizedRow.tipoDisciplina = row[k];
                    }
                });

                if (!normalizedRow.nomeCurso || !normalizedRow.nomeDisciplina) {
                    return; // Ignora linha sem curso ou disciplina
                }

                // Default Values
                const cargaTotal = Number(normalizedRow.cargaTotalHoras) || 0;
                const minHora = Number(normalizedRow.tipoHoraMin) || 60;
                const cargaDisc = Number(normalizedRow.cargaHoras) || 0;
                const ordemDisc = Number(normalizedRow.ordem) || ordemFallback++;

                let tipoDisc = String(normalizedRow.tipoDisciplina || 'teorica').toLowerCase();
                if (!['teorica', 'pratica', 'ead'].includes(tipoDisc)) tipoDisc = 'teorica';

                // Agrupar
                const cursoKey = String(normalizedRow.nomeCurso).trim();
                if (!cursosMap.has(cursoKey)) {
                    cursosMap.set(cursoKey, {
                        curso: {
                            nomeCurso: cursoKey,
                            cargaTotalHoras: cargaTotal,
                            tipoHoraMin: minHora,
                            ativo: true
                        },
                        disciplinas: []
                    });
                    ordemFallback = 1; // Reseta ordem para o novo curso
                }

                cursosMap.get(cursoKey).disciplinas.push({
                    nomeDisciplina: String(normalizedRow.nomeDisciplina).trim(),
                    cargaHoras: cargaDisc,
                    tipoDisciplina: tipoDisc as any,
                    ordem: ordemDisc
                });
            });

            const payloadMap = Array.from(cursosMap.values());

            if (payloadMap.length === 0) {
                alert('Nenhum dado válido encontrado. Verifique se as colunas estão corretas (Curso, Disciplina).');
                return;
            }

            // Validação de Soma
            const errosSoma: string[] = [];
            payloadMap.forEach(item => {
                const limit = item.curso.cargaTotalHoras;
                const somaDisc = item.disciplinas.reduce((acc: number, d: any) => acc + d.cargaHoras, 0);
                if (limit > 0 && Math.abs(limit - somaDisc) > 0.01) {
                    errosSoma.push(`O curso "${item.curso.nomeCurso}" espera ${limit}h, mas a soma de suas disciplinas dá ${somaDisc}h.`);
                }
            });

            if (errosSoma.length > 0) {
                alert('Inconsistência Analítica detectada:\n\n' + errosSoma.join('\n') + '\n\nOperação cancelada para proteger os cálculos do ScheduleEngine.');
                return;
            }

            // Invocar Service 
            const result = await catalogoService.importarCatalogoLote(payloadMap);

            if (result.success) {
                alert(`Sucesso! Matrizes importadas em lote com sucesso!\n\nCursos Cadastrados: ${result.cursosLidos}\nDisciplinas Atreladas: ${result.disciplinasCriadas}`);
                carregarCursos();
            } else {
                alert('Houve erros durante o processamento:\n' + result.erros.join('\n'));
            }

        } catch (error) {
            console.error('Erro geral no parser:', error);
            alert('Falha ao processar XLSX. Use o formato padrão sem macros.');
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!isAdmin) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500">
                <p>Acesso negado. Apenas Administradores podem gerenciar o Catálogo Base.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden dark:bg-slate-900">
            {/* Header */}
            <header className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <BookOpen className="text-blue-600" />
                        Catálogo de Cursos Base
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Defina matrizes curriculares padrão para geração massiva de turmas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${isImporting
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-slate-800'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200'
                            }`}
                        title="Importar catálogo em lote via XLS"
                    >
                        <Upload size={16} /> {isImporting ? 'Lendo Excel...' : 'Importar Excel Curricular'}
                    </button>
                    <button
                        onClick={() => handleOpenCursoModal()}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
                    >
                        <Plus size={16} /> Novo Curso Base
                    </button>
                    <button
                        onClick={handleAbrirMigracao}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
                        title="Importar cursos cadastrados no sistema legado evitando duplicatas"
                    >
                        <ArrowDownToLine size={16} /> Migrar Legado
                    </button>
                </div>
            </header>

            {/* Search toolbar */}
            <div className="px-6 py-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-sm bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                        type="text"
                        placeholder="Buscar por nome do curso ou carga horária..."
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="flex-1 bg-transparent text-sm outline-none dark:text-white placeholder-slate-400"
                    />
                    {searchQuery && (
                        <button onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="text-slate-400 hover:text-red-500">
                            <X size={13} />
                        </button>
                    )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                    {cursosFiltrados.length} de {cursos.length} curso{cursos.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center p-12 text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2"></div>
                        Carregando Catálogo Curricular...
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-4">
                        {cursosFiltrados.length === 0 ? (
                            <div className="bg-white p-10 rounded-xl border border-dashed border-gray-300 text-center dark:bg-slate-800 dark:border-slate-700">
                                <Search className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                                {searchQuery ? (
                                    <>
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Nenhum resultado para "{searchQuery}"</h3>
                                        <p className="mt-2 text-sm text-gray-500">Tente buscar pelo nome completo ou parte da carga horária.</p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Nenhum curso base cadastrado</h3>
                                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Crie a primeira matriz curricular antes de abrir a primeira turma auto-gerada.</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            cursosNaPagina.map(curso => (
                                <div key={curso.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm dark:bg-slate-800 dark:border-slate-700 transition-all">
                                    <div
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                                        onClick={() => toggleCursoExpanded(curso.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {expandedCursoId === curso.id ? <ChevronDown className="text-gray-400" /> : <ChevronRight className="text-gray-400" />}
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg flex items-center gap-2">
                                                    {curso.nomeCurso}
                                                    {!curso.ativo && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Inativo</span>}
                                                </h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Carga Prevista: {curso.cargaTotalHoras} horas ({curso.tipoHoraMin} min/h)
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => handleOpenCursoModal(curso)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded dark:hover:bg-slate-700">
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteModal({ isOpen: true, type: 'curso', id: curso.id });
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded transition"
                                                title="Excluir Curso"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Content: Disciplinas */}
                                    {expandedCursoId === curso.id && (
                                        <div className="border-t border-gray-100 bg-gray-50 p-4 dark:bg-slate-850 dark:border-slate-700">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Estrutura Curricular (Disciplinas)</h4>
                                                <button
                                                    onClick={() => handleOpenDisciplinaModal(curso.id)}
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded dark:bg-blue-900/30 dark:text-blue-400"
                                                >
                                                    + Adicionar Disciplina
                                                </button>
                                            </div>

                                            {!disciplinasPorCurso[curso.id] ? (
                                                <div className="text-center text-xs text-gray-500 py-4 cursor-wait">Carregando...</div>
                                            ) : disciplinasPorCurso[curso.id].length === 0 ? (
                                                <div className="text-center py-6 bg-white rounded-lg border border-dashed border-gray-200 dark:bg-slate-800 dark:border-slate-600">
                                                    <p className="text-sm text-gray-500">Crie blocos/disciplinas para formar o curso {curso.nomeCurso}.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {disciplinasPorCurso[curso.id].map((disc, idx) => (
                                                        <div key={disc.id} className="flex justify-between items-center py-2 px-3 bg-white border border-gray-200 rounded shadow-sm dark:bg-slate-800 dark:border-slate-700">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-gray-400 font-mono text-xs w-4">{(disc.ordem || idx + 1)}Âº</span>
                                                                <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{disc.nomeDisciplina}</span>
                                                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded 
                                                                    ${disc.tipoDisciplina === 'teorica' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                                                    {disc.tipoDisciplina}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-bold text-sm text-gray-600 dark:text-gray-400">{disc.cargaHoras}h</span>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* Soma Validation Check */}
                                                    {(() => {
                                                        const loadMateria = disciplinasPorCurso[curso.id].reduce((sum, d) => sum + d.cargaHoras, 0);
                                                        const delta = curso.cargaTotalHoras - loadMateria;
                                                        if (delta !== 0) {
                                                            return (
                                                                <div className="mt-3 text-xs flex items-center gap-2 justify-end text-amber-600 font-bold bg-amber-50 p-2 rounded dark:bg-amber-900/20">
                                                                    <AlertTriangle size={14} />
                                                                    Atenção matemática: A soma das disciplinas ({loadMateria}h) diverge da carga total do curso ({curso.cargaTotalHoras}h). Faltam {delta}h.
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}

                        {/* Paginação */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                                >← Anterior</button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={`w-9 h-9 rounded-lg text-sm font-medium transition ${currentPage === p
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                                            }`}
                                    >{p}</button>
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                                >Próximo →</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* CURSO MODAL */}
            {
                isCursoModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-800">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center dark:border-slate-700">
                                <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                    {editingCurso ? 'Editar Curso Base' : 'Novo Curso Base'}
                                </h3>
                            </div>
                            <form onSubmit={handleSaveCurso}>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Nome do Curso Educacional</label>
                                        <input
                                            required
                                            value={cursoForm.nomeCurso}
                                            onChange={e => setCursoForm({ ...cursoForm, nomeCurso: e.target.value })}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            placeholder="Ex: Formação Full Stack"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Carga Total (horas)</label>
                                            <input
                                                required type="number" min="1" step="0.5"
                                                value={cursoForm.cargaTotalHoras || ''}
                                                onChange={e => setCursoForm({ ...cursoForm, cargaTotalHoras: Number(e.target.value) })}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Minutos por Hora</label>
                                            <input
                                                required type="number" min="45" max="60"
                                                value={cursoForm.tipoHoraMin || ''}
                                                onChange={e => setCursoForm({ ...cursoForm, tipoHoraMin: Number(e.target.value) })}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:bg-slate-800/80 dark:border-slate-700">
                                    <button type="button" onClick={() => setIsCursoModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 dark:text-gray-300">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">
                                        {editingCurso ? 'Salvar Edição' : 'Criar Curso'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* DISCIPLINA MODAL */}
            {
                isDisciplinaModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-800">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center dark:border-slate-700">
                                <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                    Adicionar Disciplina
                                </h3>
                            </div>
                            <form onSubmit={handleSaveDisciplina}>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Ordem na Grade Pedagógica</label>
                                        <input
                                            type="number" min="1"
                                            value={disciplinaForm.ordem}
                                            onChange={e => setDisciplinaForm({ ...disciplinaForm, ordem: Number(e.target.value) })}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            placeholder="Ex: 1 para primeira matéria"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Nome da Disciplina</label>
                                        <input
                                            required
                                            value={disciplinaForm.nomeDisciplina}
                                            onChange={e => setDisciplinaForm({ ...disciplinaForm, nomeDisciplina: e.target.value })}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            placeholder="Lógica de Programação C#"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Carga (horas)</label>
                                            <input
                                                required type="number" min="0.5" step="0.5"
                                                value={disciplinaForm.cargaHoras || ''}
                                                onChange={e => setDisciplinaForm({ ...disciplinaForm, cargaHoras: Number(e.target.value) })}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Tipo</label>
                                            <select
                                                value={disciplinaForm.tipoDisciplina}
                                                onChange={e => setDisciplinaForm({ ...disciplinaForm, tipoDisciplina: e.target.value as any })}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                            >
                                                <option value="teorica">Teórica</option>
                                                <option value="pratica">Prática</option>
                                                <option value="ead">EAD</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:bg-slate-800/80 dark:border-slate-700">
                                    <button type="button" onClick={() => setIsDisciplinaModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-800 dark:text-gray-300">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">
                                        Confirmar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                title="Confirmar Exclusão"
                description={`Tem certeza de que deseja apagar permanentemente? Isto pode quebrar turmas geradas previamente com esta grade.`}
                onClose={() => setDeleteModal({ isOpen: false, type: 'curso', id: '' })}
                onConfirm={handleDeleteCurso}
                confirmLabel="Confirmar Exclusão"
                variant="danger"
            />

            {/* MODAL DE MIGRAÇÃO LEGADA */}
            {isMigModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20">
                            <div className="flex items-center gap-3">
                                <ArrowDownToLine className="text-emerald-600" size={22} />
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">Migração do Sistema Legado</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Importar cursos cadastrados anteriormente, evitando duplicatas</p>
                                </div>
                            </div>
                            <button onClick={() => setIsMigModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"><X size={18} /></button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                            {/* Loading state */}
                            {migStatus === 'loading' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                                    <p className="text-sm">Analisando cursos cadastrados...</p>
                                </div>
                            )}

                            {/* Migrating state */}
                            {migStatus === 'migrating' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                                    <p className="text-sm">Migrando cursos para o Catálogo Base...</p>
                                    <p className="text-xs text-gray-400">Aguarde, isso pode levar alguns segundos.</p>
                                </div>
                            )}

                            {/* Preview state */}
                            {migStatus === 'preview' && migData && (
                                <>
                                    {/* Summary bar */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 text-center border border-gray-100 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-800 dark:text-white">{migData.totalLegado}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Total Bruto</p>
                                        </div>
                                        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-center border border-gray-200 dark:border-slate-600">
                                            <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{migData.totalLegadoUnico}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Únicos no Legado</p>
                                        </div>
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-800">
                                            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{migData.novos.length}</p>
                                            <p className="text-xs text-emerald-600 mt-0.5">A Importar</p>
                                        </div>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center border border-amber-100 dark:border-amber-800">
                                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{migData.duplicatas.length + migData.duplicatasInternas.length}</p>
                                            <p className="text-xs text-amber-600 mt-0.5">Ignorados</p>
                                        </div>
                                    </div>

                                    {/* Novos cursos */}
                                    {migData.novos.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                                                <CheckCircle2 size={15} /> Cursos a serem importados ({migData.novos.length})
                                            </h4>
                                            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                {migData.novos.map((item, i) => (
                                                    <div key={i} className="flex justify-between items-center px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800/30 text-sm">
                                                        <span className="font-medium text-gray-800 dark:text-gray-200">{item.curso.nome}</span>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-gray-500">{item.curso.carga_horaria || '—'}h</span>
                                                            {item.materias.length > 0 && (
                                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded font-semibold">
                                                                    +{item.materias.length} mat.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Duplicatas com catálogo */}
                                    {migData.duplicatas.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                                                <AlertTriangle size={14} /> Já existem no Catálogo — ignorados ({migData.duplicatas.length})
                                            </h4>
                                            <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                {migData.duplicatas.map((d, i) => (
                                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800/30 text-xs text-amber-800 dark:text-amber-400">
                                                        <X size={11} className="shrink-0" /> <span className="truncate">{d.nomeLegado}</span>
                                                        <span className="text-amber-400 shrink-0">→ já existe como</span>
                                                        <span className="font-semibold truncate">{d.nomeCatalogo}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Duplicatas internas do legado */}
                                    {migData.duplicatasInternas.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                                                <AlertTriangle size={14} /> Repetidos dentro do próprio legado — descartados ({migData.duplicatasInternas.length})
                                            </h4>
                                            <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                {migData.duplicatasInternas.map((d, i) => (
                                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/10 rounded-lg border border-rose-100 dark:border-rose-800/30 text-xs text-rose-700 dark:text-rose-400">
                                                        <X size={11} className="shrink-0" /> <span className="truncate">{d.nomeLegado}</span>
                                                        <span className="text-rose-400 shrink-0 truncate">({d.motivo})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {migData.novos.length === 0 && (
                                        <div className="text-center py-6 text-gray-500">
                                            <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={32} />
                                            <p className="font-medium">Todos os cursos legados já estão no Catálogo!</p>
                                            <p className="text-sm text-gray-400">Nenhum novo curso a importar.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Done state */}
                            {migStatus === 'done' && migResult && (
                                <div className="text-center py-6 space-y-4">
                                    <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
                                    <h4 className="text-lg font-bold text-gray-800 dark:text-white">Migração Concluída!</h4>
                                    <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-emerald-700">{migResult.importados}</p>
                                            <p className="text-xs text-emerald-600">Cursos importados</p>
                                        </div>
                                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-blue-700">{migResult.disciplinasCriadas}</p>
                                            <p className="text-xs text-blue-600">Disciplinas migradas</p>
                                        </div>
                                    </div>
                                    {migResult.erros.length > 0 && (
                                        <div className="text-left bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-xs text-red-700 dark:text-red-400">
                                            <p className="font-semibold mb-1">⚠ Algumas falhas ocorreram:</p>
                                            {migResult.erros.map((e, i) => <p key={i}>• {e}</p>)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3 bg-gray-50 dark:bg-slate-800/80">
                            <button
                                onClick={() => setIsMigModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300"
                            >
                                {migStatus === 'done' ? 'Fechar' : 'Cancelar'}
                            </button>
                            {migStatus === 'preview' && migData && migData.novos.length > 0 && (
                                <button
                                    onClick={handleConfirmarMigracao}
                                    className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
                                >
                                    <ArrowDownToLine size={15} /> Confirmar Migração de {migData.novos.length} curso{migData.novos.length !== 1 ? 's' : ''}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div >

    );
};

export default CatalogoView;
