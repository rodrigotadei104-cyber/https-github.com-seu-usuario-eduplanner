import React, { useState, useEffect, useRef } from 'react';
import { Feriado, DataBloqueada } from '../types';
import { calendarioService } from '../services/calendario.service';
import { useSchedule } from '../context/ScheduleContext';
import { ConfirmationModal } from './ConfirmationModal';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

// ──────────────────────────────────────────────────────────
// Tipagem de pré-visualização de importação
// ──────────────────────────────────────────────────────────
type FeriadoPreview = {
    data: string;        // YYYY-MM-DD
    nome: string;
    tipo: string;
    status: 'novo' | 'duplicata' | 'erro';
    erro?: string;
};

// ──────────────────────────────────────────────────────────
// Normalizadores de data: aceita DD/MM/YYYY, YYYY-MM-DD ou número serial do Excel
// ──────────────────────────────────────────────────────────
function parseDataParaISO(valor: any): string | null {
    if (valor === null || valor === undefined || valor === '') return null;

    // Número serial do Excel (ex: 45000 = 2023-03-22)
    if (typeof valor === 'number') {
        const date = XLSX.SSF.parse_date_code(valor);
        if (!date) return null;
        const mm = String(date.m).padStart(2, '0');
        const dd = String(date.d).padStart(2, '0');
        return `${date.y}-${mm}-${dd}`;
    }

    const str = String(valor).trim();

    // DD/MM/YYYY
    const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    // YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return str;

    return null;
}

// ──────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────
export const CalendarioInstitucionalView: React.FC = () => {
    const { userProfile } = useSchedule();
    const isAdmin = userProfile.role === 'admin';

    const [feriados, setFeriados] = useState<Feriado[]>([]);
    const [datasBloqueadas, setDatasBloqueadas] = useState<DataBloqueada[]>([]);
    const [loading, setLoading] = useState(true);

    // Modais individuais
    const [isFeriadoModalOpen, setIsFeriadoModalOpen] = useState(false);
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

    // Forms
    const [feriadoForm, setFeriadoForm] = useState({ dataReferencia: '', nome: '', tipo: 'nacional', recorrenteAnualmente: false });
    const [blockForm, setBlockForm] = useState({ dataBloqueio: '', motivo: '' });
    const [isSaving, setIsSaving] = useState(false);

    // Delete
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'feriado' | 'block'; id: string }>({ isOpen: false, type: 'feriado', id: '' });

    // Importação Excel
    const fileInputRef = useRef<HTMLInputElement>(null);
    type ImportStatus = 'idle' | 'preview' | 'importing' | 'done';
    const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
    const [importPreview, setImportPreview] = useState<FeriadoPreview[]>([]);
    const [importResult, setImportResult] = useState<{ importados: number; duplicatas: number } | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        carregarCalendario();
    }, []);

    const carregarCalendario = async () => {
        setLoading(true);
        try {
            const [feriadosData, bloqueiosData] = await Promise.all([
                calendarioService.getFeriados(),
                calendarioService.getDatasBloqueadas()
            ]);
            setFeriados(feriadosData);
            setDatasBloqueadas(bloqueiosData);
        } catch (error) {
            console.error('Erro ao carregar calendário:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDataBR = (strData: string) => {
        try { return format(parseISO(strData), 'dd/MM/yyyy'); }
        catch { return strData; }
    };

    // ── FERIADO INDIVIDUAL ─────────────────────────────────
    const handleSaveFeriado = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            await calendarioService.createFeriado(feriadoForm);
            setIsFeriadoModalOpen(false);
            setFeriadoForm({ dataReferencia: '', nome: '', tipo: 'nacional', recorrenteAnualmente: false });
            await carregarCalendario();
        } catch (error: any) {
            alert('Erro ao salvar feriado: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ── BLOQUEIO MANUAL ────────────────────────────────────
    const handleSaveBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            await calendarioService.createBloqueio(blockForm);
            setIsBlockModalOpen(false);
            setBlockForm({ dataBloqueio: '', motivo: '' });
            await carregarCalendario();
        } catch (error: any) {
            alert('Erro ao salvar bloqueio: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ── DELETE ─────────────────────────────────────────────
    const handleDelete = async () => {
        try {
            if (deleteModal.type === 'feriado') {
                await calendarioService.deleteFeriado(deleteModal.id);
            } else {
                await calendarioService.deleteBloqueio(deleteModal.id);
            }
            await carregarCalendario();
        } catch (error: any) {
            alert('Erro ao remover: ' + error.message);
        } finally {
            setDeleteModal({ isOpen: false, type: 'feriado', id: '' });
        }
    };

    // ── IMPORTAÇÃO EXCEL ───────────────────────────────────
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                if (rows.length < 2) {
                    alert('Planilha vazia ou sem dados após o cabeçalho.');
                    return;
                }

                // Normalizar cabeçalho
                const header: string[] = (rows[0] as any[]).map(h =>
                    String(h).trim().toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .replace(/\s+/g, '_')
                );

                const synonyms: Record<string, string> = {
                    data: 'data', date: 'data', dt: 'data', 'data_do_feriado': 'data',
                    nome: 'nome', name: 'nome', descricao: 'nome', descricão: 'nome',
                    feriado: 'nome', holiday: 'nome', titulo: 'nome',
                    tipo: 'tipo', type: 'tipo', ambito: 'tipo', escopo: 'tipo',
                    recorrente: 'recorrente_anualmente', anual: 'recorrente_anualmente',
                    recorrente_anualmente: 'recorrente_anualmente', repetir: 'recorrente_anualmente',
                };

                const colMap: Record<string, number> = {};
                header.forEach((h, idx) => {
                    const mapped = synonyms[h];
                    if (mapped && !(mapped in colMap)) colMap[mapped] = idx;
                });

                if (colMap['data'] === undefined) {
                    alert('Coluna de data não encontrada. Use "Data", "Date" ou "dt" como cabeçalho.');
                    return;
                }

                // Datas já cadastradas para detectar duplicatas
                const datasExistentes = new Set(feriados.map(f => (f as any).dataReferencia || f.data));

                const preview: FeriadoPreview[] = [];

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i] as any[];
                    const rawData = row[colMap['data']];
                    const dataISO = parseDataParaISO(rawData);

                    if (!dataISO) {
                        if (row.every(c => c === '' || c === null)) continue;
                        preview.push({ data: String(rawData), nome: '', tipo: 'nacional', status: 'erro', erro: 'Data inválida: ' + rawData });
                        continue;
                    }

                    const nome = colMap['nome'] !== undefined ? String(row[colMap['nome']] || '').trim() : 'Feriado';
                    const tipoRaw = colMap['tipo'] !== undefined ? String(row[colMap['tipo']] || '').trim().toLowerCase() : 'nacional';
                    const tipo = ['nacional', 'estadual', 'municipal'].includes(tipoRaw) ? tipoRaw : 'nacional';

                    preview.push({
                        data: dataISO,
                        nome: nome || 'Feriado',
                        tipo,
                        status: datasExistentes.has(dataISO) ? 'duplicata' : 'novo',
                    });
                }

                setImportPreview(preview);
                setImportStatus('preview');
                setIsImportModalOpen(true);
            } catch (err: any) {
                alert('Erro ao ler planilha: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        // Limpar input para permitir re-upload do mesmo arquivo
        e.target.value = '';
    };

    const handleConfirmarImportacao = async () => {
        const novos = importPreview.filter(f => f.status === 'novo');
        if (novos.length === 0) return;
        setImportStatus('importing');
        try {
            const result = await calendarioService.importarFeriadosLote(novos);
            setImportResult({ importados: result.importados, duplicatas: importPreview.filter(f => f.status === 'duplicata').length });
            setImportStatus('done');
            await carregarCalendario();
        } catch (err: any) {
            alert('Erro na importação: ' + err.message);
            setImportStatus('preview');
        }
    };

    const novosCount = importPreview.filter(f => f.status === 'novo').length;
    const duplicatasCount = importPreview.filter(f => f.status === 'duplicata').length;
    const errosCount = importPreview.filter(f => f.status === 'erro').length;

    if (!isAdmin) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500">
                <p>Acesso negado. Apenas Administradores podem gerenciar o Calendário Oficial.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden dark:bg-slate-900">
            {/* Header */}
            <header className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700">
                <div>
                    <h1 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tighter border-b-2 border-red-600 inline-block">
                        Calendário de Bloqueios
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Gerencie feriados e datas de recesso. O Motor de Agenda pula estes dias automaticamente.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Importar via Excel */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 transition shadow-sm"
                        title="Importar feriados de planilha Excel"
                    >
                         Importar Excel
                    </button>

                    <button
                        onClick={() => setIsFeriadoModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition shadow-sm"
                    >
                        Novo Feriado
                    </button>
                    <button
                        onClick={() => setIsBlockModalOpen(true)}
                        className="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-gray-200 transition shadow-sm"
                    >
                        Bloqueio Avulso
                    </button>
                </div>
            </header>

            {/* Info da planilha modelo */}
            <div className="px-6 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800 text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-2">
                [ MODELO EXCEL ]
                <span>
                     Colunas: Data (DD/MM/AAAA) + Feriado (nome).
                </span>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center p-12 text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2"></div>
                        Carregando Calendário...
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* COLUNA 1: Feriados */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2 dark:text-gray-100">
                                Feriados Nacionais / Municipais
                                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({feriados.length})</span>
                            </h3>
                            {feriados.length === 0 ? (
                                <div className="bg-white p-6 rounded-xl border border-dashed border-gray-300 text-center dark:bg-slate-800 dark:border-slate-700">
                                    <p className="text-sm text-gray-500">Nenhum feriado cadastrado.</p>
                                    <p className="text-xs text-gray-400 mt-1">Use "Importar Excel" para adicionar vários de uma vez.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {feriados.map(f => (
                                        <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between dark:bg-slate-800 dark:border-slate-700">
                                            <div>
                                                <p className="font-bold text-red-600 dark:text-red-400 text-lg">{formatDataBR((f as any).dataReferencia || f.data)}</p>
                                                <p className="font-medium text-gray-800 dark:text-gray-200">{(f as any).nome || 'Feriado'}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase font-bold tracking-wider dark:bg-slate-700 dark:text-gray-300">{f.tipo}</span>
                                                    {(f as any).recorrenteAnualmente && (
                                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold tracking-wider dark:bg-blue-900/40 dark:text-blue-300">Anual Base</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => setDeleteModal({ isOpen: true, type: 'feriado', id: f.id })} className="px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-50 border border-rose-100 uppercase tracking-widest rounded">
                                                Apagar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* COLUNA 2: Bloqueios Manuais */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2 dark:text-gray-100">
                                Bloqueios Avulsos (Eventos / Recessos)
                                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({datasBloqueadas.length})</span>
                            </h3>
                            {datasBloqueadas.length === 0 ? (
                                <div className="bg-white p-6 rounded-xl border border-dashed border-gray-300 text-center dark:bg-slate-800 dark:border-slate-700">
                                    <p className="text-sm text-gray-500">Nenhum bloqueio avulso cadastrado.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {datasBloqueadas.map(b => (
                                        <div key={b.id} className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm flex items-center justify-between dark:bg-slate-800 dark:border-amber-900/50">
                                            <div>
                                                <p className="font-bold text-amber-600 dark:text-amber-500 text-lg">{formatDataBR((b as any).dataBloqueio || (b as any).data)}</p>
                                                <p className="font-medium text-gray-800 dark:text-gray-200">{b.motivo || 'Motivo não especificado'}</p>
                                                <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase font-bold tracking-wider dark:bg-amber-900/30 dark:text-amber-400">Bloqueio Manual</span>
                                            </div>
                                            <button onClick={() => setDeleteModal({ isOpen: true, type: 'block', id: b.id })} className="px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-50 border border-rose-100 uppercase tracking-widest rounded">
                                                Apagar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL FERIADO INDIVIDUAL */}
            {isFeriadoModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-800">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center dark:border-slate-700">
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Registrar Feriado</h3>
                            <button onClick={() => setIsFeriadoModalOpen(false)} className="text-gray-400 hover:text-black font-black">FECHAR</button>
                        </div>
                        <form onSubmit={handleSaveFeriado}>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Data do Feriado</label>
                                    <input
                                        type="date" required
                                        value={feriadoForm.dataReferencia}
                                        onChange={e => setFeriadoForm({ ...feriadoForm, dataReferencia: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Nome (Ex: Tiradentes)</label>
                                    <input
                                        required
                                        value={feriadoForm.nome}
                                        onChange={e => setFeriadoForm({ ...feriadoForm, nome: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        placeholder="Ex: Dia do Trabalho"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Âmbito</label>
                                        <select
                                            value={feriadoForm.tipo}
                                            onChange={e => setFeriadoForm({ ...feriadoForm, tipo: e.target.value })}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        >
                                            <option value="nacional">Nacional</option>
                                            <option value="estadual">Estadual</option>
                                            <option value="municipal">Municipal</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-center pt-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={feriadoForm.recorrenteAnualmente}
                                                onChange={e => setFeriadoForm({ ...feriadoForm, recorrenteAnualmente: e.target.checked })}
                                                className="rounded border-gray-300 text-blue-600"
                                            />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Anual Base</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:bg-slate-800/80 dark:border-slate-700">
                                <button type="button" onClick={() => setIsFeriadoModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
                                <button type="submit" disabled={isSaving} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-60">
                                    {isSaving ? 'Salvando...' : 'Salvar Feriado'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL BLOQUEIO MANUAL */}
            {isBlockModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-800 border border-amber-500/30">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-slate-700 dark:text-amber-100">
                            <div className="flex items-center gap-3">
                                <div className="px-2 py-1 bg-amber-600 text-white text-[10px] font-black rounded uppercase tracking-widest">Atenção</div>
                                <h3 className="font-black text-lg uppercase tracking-tighter">Inserir Bloqueio</h3>
                            </div>
                            <button onClick={() => setIsBlockModalOpen(false)} className="text-amber-500 hover:text-amber-700 font-black">X</button>
                        </div>
                        <form onSubmit={handleSaveBlock}>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Data Bloqueada</label>
                                    <input
                                        type="date" required
                                        value={blockForm.dataBloqueio}
                                        onChange={e => setBlockForm({ ...blockForm, dataBloqueio: e.target.value })}
                                        className="w-full rounded-lg border-amber-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    />
                                    <p className="text-xs text-amber-600 mt-1">Nenhuma turma nova agendará aulas neste dia.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Motivo (Opcional)</label>
                                    <input
                                        value={blockForm.motivo}
                                        onChange={e => setBlockForm({ ...blockForm, motivo: e.target.value })}
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm p-2 border dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        placeholder="Reunião Pedagógica / Recesso"
                                    />
                                </div>
                            </div>
                            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:bg-slate-800/80 dark:border-slate-700">
                                <button type="button" onClick={() => setIsBlockModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
                                <button type="submit" disabled={isSaving} className="px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm disabled:opacity-60">
                                    {isSaving ? 'Salvando...' : 'Bloquear Data'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DE IMPORTAÇÃO EXCEL */}
            {isImportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20">
                            <div className="flex items-center gap-3">
                                <div className="px-2 py-1 bg-emerald-600 text-white text-[10px] font-black rounded uppercase tracking-widest">XLS</div>
                                <div>
                                    <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tighter">Importar via Excel</h3>
                                </div>
                            </div>
                            <button onClick={() => { setIsImportModalOpen(false); setImportStatus('idle'); }} className="text-gray-400 hover:text-black font-black">FECHAR</button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                            {/* Importing */}
                            {importStatus === 'importing' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
                                    <p className="text-sm">Importando feriados...</p>
                                </div>
                            )}

                            {/* Done */}
                            {importStatus === 'done' && importResult && (
                                <div className="text-center py-8 space-y-4">
                                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-black mb-4">OK</div>
                                    <h4 className="text-lg font-bold text-gray-800 dark:text-white">Importação Concluída!</h4>
                                    <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-emerald-700">{importResult.importados}</p>
                                            <p className="text-xs text-emerald-600">Feriados importados</p>
                                        </div>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-amber-700">{importResult.duplicatas}</p>
                                            <p className="text-xs text-amber-600">Ignorados (já existiam)</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Preview */}
                            {importStatus === 'preview' && (
                                <>
                                    {/* Contadores */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-800">
                                            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{novosCount}</p>
                                            <p className="text-xs text-emerald-600">A Importar</p>
                                        </div>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center border border-amber-100 dark:border-amber-800">
                                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{duplicatasCount}</p>
                                            <p className="text-xs text-amber-600">Duplicatas (ignorar)</p>
                                        </div>
                                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center border border-red-100 dark:border-red-800">
                                            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{errosCount}</p>
                                            <p className="text-xs text-red-600">Erros de formato</p>
                                        </div>
                                    </div>

                                    {/* Tabela de pré-visualização */}
                                    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Status</th>
                                                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Data</th>
                                                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Nome</th>
                                                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Tipo</th>
                                                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Anual</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                                    {importPreview.map((f, i) => (
                                                        <tr key={i} className={
                                                            f.status === 'novo' ? 'bg-white dark:bg-slate-800 hover:bg-emerald-50/50' :
                                                                f.status === 'duplicata' ? 'bg-amber-50/50 dark:bg-amber-900/10' :
                                                                    'bg-red-50/50 dark:bg-red-900/10'
                                                        }>
                                                            <td className="px-3 py-2">
                                                                {f.status === 'novo' && <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">NOVO</span>}
                                                                {f.status === 'duplicata' && <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold">DUP.</span>}
                                                                {f.status === 'erro' && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">ERRO</span>}
                                                            </td>
                                                            <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                                                                {f.status !== 'erro' ? formatDataBR(f.data) : f.data}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                                                                {f.status === 'erro' ? <span className="text-red-600 text-xs">{f.erro}</span> : f.nome}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400 capitalize text-xs">{f.status !== 'erro' ? f.tipo : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {novosCount === 0 && (
                                        <div className="text-center py-4 text-gray-500 text-sm">
                                            Nenhum feriado novo para importar — todos já estão cadastrados.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800/80">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 flex items-center gap-1.5"
                            >
                                <span className="text-[10px] font-black uppercase">Escolher outra planilha</span>
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setIsImportModalOpen(false); setImportStatus('idle'); }}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300"
                                >
                                    {importStatus === 'done' ? 'Fechar' : 'Cancelar'}
                                </button>
                                {importStatus === 'preview' && novosCount > 0 && (
                                    <button
                                        onClick={handleConfirmarImportacao}
                                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
                                    >
                                        Importar {novosCount} feriado{novosCount !== 1 ? 's' : ''}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                title="Remover Bloqueio"
                description="Tem certeza? Turmas já geradas não serão remanejadas, mas novas turmas poderão usar essa data."
                onClose={() => setDeleteModal({ isOpen: false, type: 'feriado', id: '' })}
                onConfirm={handleDelete}
                confirmLabel="Confirmar Remoção"
                variant="danger"
            />
        </div>
    );
};
