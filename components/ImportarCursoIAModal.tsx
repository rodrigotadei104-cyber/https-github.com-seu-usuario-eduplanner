import React, { useState, useRef, useMemo } from 'react';
import { catalogoService } from '../services/catalogo.service';
import { auditService } from '../services/audit.service';

interface DisciplinaDraft {
    nomeDisciplina: string;
    cargaHoras: number;
    tipoDisciplina: 'teorica' | 'pratica';
    ordem: number;
}

interface MatrizDraft {
    nomeCurso: string;
    tipoHoraMin: number;
    disciplinas: DisciplinaDraft[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImported: () => void; // callback para recarregar a lista de cursos
}

type Stage = 'input' | 'loading' | 'preview' | 'saving' | 'done';

// Converte um File de imagem para { data: base64SemPrefixo, mimeType }
function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.split(',')[1] || '';
            resolve({ data: base64, mimeType: file.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export const ImportarCursoIAModal: React.FC<Props> = ({ isOpen, onClose, onImported }) => {
    const [stage, setStage] = useState<Stage>('input');
    const [texto, setTexto] = useState('');
    const [imagemPreview, setImagemPreview] = useState<string | null>(null);
    const [imagemPayload, setImagemPayload] = useState<{ data: string; mimeType: string } | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [draft, setDraft] = useState<MatrizDraft | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const cargaTotal = useMemo(() => {
        if (!draft) return 0;
        return Math.round(draft.disciplinas.reduce((acc, d) => acc + (Number(d.cargaHoras) || 0), 0) * 100) / 100;
    }, [draft]);

    const resetTudo = () => {
        setStage('input');
        setTexto('');
        setImagemPreview(null);
        setImagemPayload(null);
        setErro(null);
        setDraft(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        resetTudo();
        onClose();
    };

    const handleSelecionarImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setErro('Envie um arquivo de imagem (PNG, JPG, etc.).');
            return;
        }
        try {
            const payload = await fileToBase64(file);
            setImagemPayload(payload);
            setImagemPreview(URL.createObjectURL(file));
            setErro(null);
        } catch {
            setErro('Não foi possível ler a imagem selecionada.');
        }
    };

    const removerImagem = () => {
        setImagemPayload(null);
        setImagemPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleInterpretar = async () => {
        if (!texto.trim() && !imagemPayload) {
            setErro('Cole o texto da matriz ou envie um print.');
            return;
        }
        setErro(null);
        setStage('loading');
        try {
            const result = await catalogoService.interpretarMatriz({
                text: texto.trim() || undefined,
                image: imagemPayload || undefined
            });
            setDraft({
                nomeCurso: result.nomeCurso || '',
                tipoHoraMin: result.tipoHoraMin || 60,
                disciplinas: (result.disciplinas || []).map((d, i) => ({
                    nomeDisciplina: d.nomeDisciplina,
                    cargaHoras: d.cargaHoras,
                    tipoDisciplina: d.tipoDisciplina,
                    ordem: d.ordem || i + 1
                }))
            });
            setStage('preview');
        } catch (e: any) {
            setErro(e?.message || 'Falha ao interpretar a matriz.');
            setStage('input');
        }
    };

    // --- edição do draft no preview ---
    const updateCurso = (patch: Partial<MatrizDraft>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);
    const updateDisciplina = (idx: number, patch: Partial<DisciplinaDraft>) => {
        setDraft(prev => {
            if (!prev) return prev;
            const disciplinas = prev.disciplinas.map((d, i) => i === idx ? { ...d, ...patch } : d);
            return { ...prev, disciplinas };
        });
    };
    const removerDisciplina = (idx: number) => {
        setDraft(prev => {
            if (!prev) return prev;
            const disciplinas = prev.disciplinas.filter((_, i) => i !== idx).map((d, i) => ({ ...d, ordem: i + 1 }));
            return { ...prev, disciplinas };
        });
    };
    const adicionarDisciplina = () => {
        setDraft(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                disciplinas: [...prev.disciplinas, { nomeDisciplina: '', cargaHoras: 0, tipoDisciplina: 'teorica', ordem: prev.disciplinas.length + 1 }]
            };
        });
    };

    const draftValido = useMemo(() => {
        if (!draft) return false;
        if (!draft.nomeCurso.trim()) return false;
        if (draft.disciplinas.length === 0) return false;
        return draft.disciplinas.every(d => d.nomeDisciplina.trim() && Number(d.cargaHoras) > 0);
    }, [draft]);

    const handleSalvar = async () => {
        if (!draft || !draftValido) return;
        setStage('saving');
        try {
            const result = await catalogoService.importarCatalogoLote([{
                curso: {
                    nomeCurso: draft.nomeCurso.trim(),
                    cargaTotalHoras: cargaTotal,
                    tipoHoraMin: String(draft.tipoHoraMin),
                    ativo: true
                },
                disciplinas: draft.disciplinas.map(d => ({
                    nomeDisciplina: d.nomeDisciplina.trim(),
                    cargaHoras: Number(d.cargaHoras),
                    tipoDisciplina: d.tipoDisciplina,
                    ordem: d.ordem
                }))
            }]);

            if (!result.success) {
                setErro('Erros ao gravar: ' + result.erros.join(' | '));
                setStage('preview');
                return;
            }

            try {
                await auditService.log({
                    action: 'IMPORT',
                    entity: `Curso: ${draft.nomeCurso.trim()}`,
                    result: 'success',
                    details: { origem: 'IA', disciplinas: draft.disciplinas.length, cargaTotalHoras: cargaTotal }
                });
            } catch { /* auditoria não deve bloquear o fluxo */ }

            setStage('done');
            onImported();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao gravar o curso.');
            setStage('preview');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20">
                    <div className="flex items-center gap-3">
                        <div className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-black rounded uppercase tracking-widest">
                            Importar com IA
                        </div>
                        <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tighter">Leitura de Matriz</h3>
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-black dark:hover:text-white font-black text-xs uppercase tracking-widest">Fechar</button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {erro && (
                        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300 font-medium">
                            {erro}
                        </div>
                    )}

                    {/* INPUT */}
                    {stage === 'input' && (
                        <>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Cole o texto da matriz</label>
                                <textarea
                                    value={texto}
                                    onChange={e => setTexto(e.target.value)}
                                    rows={7}
                                    placeholder={"Ex.:\nNome: Excel Básico\nComponente Curricular | Tipo | Carga Horária\nPlanilha Excel: inserir dados... | Teórico | 12:00\nUsando fórmulas básicas... | Teórico | 08:00\nCarga Horária Total: 20:00 / hora aula 50 minutos"}
                                    className="w-full rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex-1 border-t border-dashed border-gray-200 dark:border-slate-600" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">e/ou</span>
                                <div className="flex-1 border-t border-dashed border-gray-200 dark:border-slate-600" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Envie um print da matriz</label>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelecionarImagem} />
                                {!imagemPreview ? (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-6 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition font-medium"
                                    >
                                        Clique para selecionar uma imagem (PNG, JPG)
                                    </button>
                                ) : (
                                    <div className="relative inline-block">
                                        <img src={imagemPreview} alt="Print da matriz" className="max-h-48 rounded-lg border border-gray-200 dark:border-slate-600" />
                                        <button
                                            onClick={removerImagem}
                                            className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] font-black w-6 h-6 rounded-full shadow"
                                            title="Remover imagem"
                                        >X</button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* LOADING */}
                    {stage === 'loading' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
                            <p className="text-sm font-medium">A IA está lendo a matriz...</p>
                        </div>
                    )}

                    {/* SAVING */}
                    {stage === 'saving' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
                            <p className="text-sm font-medium">Gravando curso e disciplinas...</p>
                        </div>
                    )}

                    {/* PREVIEW */}
                    {stage === 'preview' && draft && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Nome do curso</label>
                                    <input
                                        value={draft.nomeCurso}
                                        onChange={e => updateCurso({ nomeCurso: e.target.value })}
                                        className="w-full rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Min / hora-aula</label>
                                    <input
                                        type="number" min={30} max={60}
                                        value={draft.tipoHoraMin || ''}
                                        onChange={e => updateCurso({ tipoHoraMin: Number(e.target.value) })}
                                        className="w-full rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Disciplinas ({draft.disciplinas.length})</h4>
                                    <button onClick={adicionarDisciplina} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-1 rounded">
                                        + Adicionar
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {draft.disciplinas.map((d, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2">
                                            <span className="text-gray-400 font-mono text-xs w-5 text-center shrink-0">{idx + 1}</span>
                                            <input
                                                value={d.nomeDisciplina}
                                                onChange={e => updateDisciplina(idx, { nomeDisciplina: e.target.value })}
                                                placeholder="Nome da disciplina"
                                                className="flex-1 min-w-0 rounded border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-1.5 text-sm"
                                            />
                                            <select
                                                value={d.tipoDisciplina}
                                                onChange={e => updateDisciplina(idx, { tipoDisciplina: e.target.value as 'teorica' | 'pratica' })}
                                                className="rounded border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-1.5 text-xs shrink-0"
                                            >
                                                <option value="teorica">Teórica</option>
                                                <option value="pratica">Prática</option>
                                            </select>
                                            <input
                                                type="number" min={0} step={0.5}
                                                value={d.cargaHoras || ''}
                                                onChange={e => updateDisciplina(idx, { cargaHoras: Number(e.target.value) })}
                                                className="w-20 rounded border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white p-1.5 text-sm text-right shrink-0"
                                                title="Carga em horas-aula"
                                            />
                                            <span className="text-xs text-gray-400 shrink-0">h</span>
                                            <button onClick={() => removerDisciplina(idx)} className="text-rose-500 hover:text-rose-700 font-black text-xs px-1 shrink-0" title="Remover">X</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg px-4 py-3">
                                <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Carga total (soma)</span>
                                <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">{cargaTotal}h</span>
                            </div>
                            <p className="text-[11px] text-gray-400">A carga total é calculada automaticamente pela soma das disciplinas, garantindo consistência para a geração de turmas.</p>
                        </>
                    )}

                    {/* DONE */}
                    {stage === 'done' && draft && (
                        <div className="text-center py-8 space-y-3">
                            <span className="text-5xl font-black text-emerald-400 block">OK</span>
                            <h4 className="text-lg font-bold text-gray-800 dark:text-white">Curso cadastrado!</h4>
                            <p className="text-sm text-gray-500">
                                <span className="font-bold">{draft.nomeCurso}</span> — {draft.disciplinas.length} disciplina(s), {cargaTotal}h no total.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3 bg-gray-50 dark:bg-slate-800/80">
                    {stage === 'input' && (
                        <>
                            <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300">Cancelar</button>
                            <button
                                onClick={handleInterpretar}
                                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
                            >
                                Interpretar matriz
                            </button>
                        </>
                    )}
                    {stage === 'preview' && (
                        <>
                            <button onClick={() => { setStage('input'); setErro(null); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300">Voltar</button>
                            <button
                                onClick={handleSalvar}
                                disabled={!draftValido}
                                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Confirmar cadastro
                            </button>
                        </>
                    )}
                    {stage === 'done' && (
                        <button onClick={handleClose} className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition">Fechar</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportarCursoIAModal;
