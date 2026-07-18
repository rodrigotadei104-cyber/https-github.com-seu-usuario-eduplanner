import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useSchedule } from '../context/ScheduleContext';
import { supabase } from '../lib/supabase';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

// Linha normalizada da planilha
interface LinhaAgenda {
    idTurma: string;
    curso: string;
    componente: string;
    instrutorNome: string;
    instrutorId: string | null;
    data: string;      // yyyy-MM-dd
    inicio: string;    // HH:mm
    fim: string;       // HH:mm
    sala: string;
    situacao: string;
    _key: string;      // idTurma|data|inicio (dedupe)
}

type Stage = 'upload' | 'parsing' | 'preview' | 'saving' | 'done';

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const normKey = (s: string) => norm(s).replace(/\s+/g, '');

// "01/07/2026" ou "7/8/26" -> "2026-07-01" (tolerante a ano de 2 dígitos e Excel serial)
const parseData = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    // DD/MM/YYYY ou D/M/AA
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        const ano = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    // ISO
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // Serial do Excel (dias desde 1899-12-30)
    if (/^\d+(\.\d+)?$/.test(s)) {
        const serial = parseFloat(s);
        if (serial > 59) {
            const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
    }
    return null;
};

// "07:30:00:000" -> "07:30"
const parseHora = (v: any): string | null => {
    if (v == null) return null;
    const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export const ImportarAgendaExcelModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const { instrutores, userProfile, refreshData } = useSchedule();
    const tenantId = userProfile.tenantId;
    const fileRef = useRef<HTMLInputElement>(null);

    const [stage, setStage] = useState<Stage>('upload');
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');

    const [novas, setNovas] = useState<LinhaAgenda[]>([]);
    const [qtdExistentes, setQtdExistentes] = useState(0);
    const [qtdSemInstrutor, setQtdSemInstrutor] = useState(0);
    const [qtdInvalidas, setQtdInvalidas] = useState(0);
    const [conflitos, setConflitos] = useState<LinhaAgenda[]>([]);
    const [totalLidas, setTotalLidas] = useState(0);
    const [salvarResult, setSalvarResult] = useState<{ ok: number; err: string | null }>({ ok: 0, err: null });

    const reset = () => {
        setStage('upload'); setError(null); setFileName('');
        setNovas([]); setQtdExistentes(0); setQtdSemInstrutor(0); setQtdInvalidas(0); setTotalLidas(0);
        setConflitos([]);
        setSalvarResult({ ok: 0, err: null });
        if (fileRef.current) fileRef.current.value = '';
    };
    const handleClose = () => { reset(); onClose(); };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setError(null);
        setStage('parsing');
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { cellDates: false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: false });
            if (rows.length === 0) throw new Error('Planilha vazia.');

            // Mapa flexível de colunas (nomes podem variar um pouco)
            const headers = Object.keys(rows[0]);
            const findCol = (test: (k: string) => boolean) => headers.find(h => test(normKey(h)));
            const colIdTurma = findCol(k => k.includes('idturma') || (k.includes('id') && k.includes('turma')));
            const colCurso = findCol(k => k === 'curso' || (k.includes('curso') && !k.includes('componente') && !k.includes('id')));
            const colComp = findCol(k => k.includes('componente') || k.includes('curricular'));
            const colInstr = findCol(k => k.includes('instrutor'));
            const colData = findCol(k => k === 'data' || k.startsWith('data'));
            const colIni = findCol(k => k.includes('hora') && k.includes('inicio'));
            const colFim = findCol(k => k.includes('hora') && k.includes('fim'));
            const colSala = findCol(k => k.includes('espaco') || k.includes('fisico') || k === 'sala');
            const colSit = findCol(k => k.includes('situacao'));

            if (!colIdTurma || !colData || !colIni) {
                throw new Error('Não encontrei as colunas essenciais (Id Turma, Data, Hora Início). Confira se é a planilha certa.');
            }

            // Índice de instrutores por nome normalizado
            const instrIdx = new Map<string, string>();
            instrutores.forEach(i => instrIdx.set(norm(i.nome), i.id));

            const parsed: LinhaAgenda[] = [];
            let invalidas = 0, semInstrutor = 0;

            for (const r of rows) {
                const data = parseData(r[colData!]);
                const inicio = parseHora(r[colIni!]);
                const fim = colFim ? parseHora(r[colFim]) : null;
                const idTurma = r[colIdTurma!] != null ? String(r[colIdTurma!]).trim() : '';
                if (!data || !inicio || !idTurma) { invalidas++; continue; }

                const instrNome = colInstr ? String(r[colInstr] || '').trim() : '';
                const instrId = instrNome ? (instrIdx.get(norm(instrNome)) || null) : null;
                if (instrNome && !instrId) semInstrutor++;

                parsed.push({
                    idTurma,
                    curso: colCurso ? String(r[colCurso] || '').trim() : '',
                    componente: colComp ? String(r[colComp] || '').trim() : '',
                    instrutorNome: instrNome,
                    instrutorId: instrId,
                    data,
                    inicio,
                    fim: fim || inicio,
                    sala: colSala ? String(r[colSala] || '').trim() : '',
                    situacao: colSit ? String(r[colSit] || '').trim() : '',
                    _key: `${idTurma}|${data}|${inicio}`
                });
            }

            if (parsed.length === 0) throw new Error('Nenhuma linha válida encontrada (faltando Id Turma, Data ou Hora).');

            // Dedupe: buscar aulas já existentes dessas turmas
            const idTurmas = Array.from(new Set(parsed.map(p => p.idTurma)));
            const { data: existentes, error: errEx } = await supabase
                .from('aulas')
                .select('numero_turma, data, horario_inicio')
                .in('numero_turma', idTurmas);
            if (errEx) throw new Error('Falha ao checar duplicidade: ' + errEx.message);

            const existentesSet = new Set(
                (existentes || []).map((a: any) => `${a.numero_turma}|${a.data}|${String(a.horario_inicio).slice(0, 5)}`)
            );

            const novasArr: LinhaAgenda[] = [];
            let existentesCount = 0;
            const vistas = new Set<string>();
            for (const p of parsed) {
                if (existentesSet.has(p._key) || vistas.has(p._key)) { existentesCount++; continue; }
                vistas.add(p._key);
                novasArr.push(p);
            }

            // Conflito de instrutor: mesma pessoa (instrutor_id) em outra aula no mesmo dia+hora,
            // seja contra o que já existe no banco, seja duas vezes dentro da própria planilha.
            const idsInstr = Array.from(new Set(novasArr.filter(p => p.instrutorId).map(p => p.instrutorId!)));
            const conflitosArr: LinhaAgenda[] = [];
            if (idsInstr.length > 0) {
                const { data: aulasInstr, error: errCf } = await supabase
                    .from('aulas')
                    .select('instrutor_id, data, horario_inicio')
                    .in('instrutor_id', idsInstr);
                if (errCf) throw new Error('Falha ao checar conflitos de instrutor: ' + errCf.message);
                const ocupado = new Set((aulasInstr || []).map((a: any) => `${a.instrutor_id}|${a.data}|${String(a.horario_inicio).slice(0, 5)}`));
                const vistosInstr = new Set<string>();
                for (const p of novasArr) {
                    if (!p.instrutorId) continue;
                    const k = `${p.instrutorId}|${p.data}|${p.inicio}`;
                    if (ocupado.has(k) || vistosInstr.has(k)) conflitosArr.push(p);
                    else vistosInstr.add(k);
                }
            }

            setTotalLidas(rows.length);
            setQtdInvalidas(invalidas);
            setQtdSemInstrutor(semInstrutor);
            setQtdExistentes(existentesCount);
            setNovas(novasArr);
            setConflitos(conflitosArr);
            setStage('preview');
        } catch (err: any) {
            setError(err?.message || 'Erro ao ler a planilha.');
            setStage('upload');
        }
    };

    const handleConfirmar = async () => {
        if (novas.length === 0) return;
        if (conflitos.length > 0) { setError('Existem conflitos. Corrija-os na planilha e reimporte.'); return; }
        setStage('saving');
        setError(null);
        try {
            const rows = novas.map(p => ({
                tenant_id: tenantId,
                data: p.data,
                horario_inicio: p.inicio,
                horario_fim: p.fim,
                nome_curso: p.curso || null,
                nome_materia: p.componente || null,
                nome_instrutor: p.instrutorNome || null,
                instrutor_id: p.instrutorId,
                sala: p.sala || null,
                numero_turma: p.idTurma,
                status: 'agendada', // importadas entram como agendada (sem materia_id não podem ser 'concluida')
                auto_gerada: true,
                tipo_aula: 'NORMAL',
                contabiliza_carga: true
            }));

            // Insert atômico em lotes: se qualquer lote falhar, aborta e nada parcial é considerado sucesso.
            let ok = 0;
            for (let i = 0; i < rows.length; i += 500) {
                const lote = rows.slice(i, i + 500);
                const { error: errIns } = await supabase.from('aulas').insert(lote);
                if (errIns) throw new Error(errIns.message);
                ok += lote.length;
            }
            setSalvarResult({ ok, err: null });
            setStage('done');
            await refreshData();
        } catch (err: any) {
            setSalvarResult({ ok: 0, err: err?.message || String(err) });
            setStage('preview');
            setError('Erro ao gravar: ' + (err?.message || String(err)));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh] border border-slate-200 dark:border-slate-700">
                {/* Header */}
                <div className="px-6 py-4 border-b border-cyan-700 flex justify-between items-center bg-cyan-600 dark:bg-cyan-800">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-tighter">Importar Agenda (Power BI)</h2>
                        <p className="text-[10px] font-black text-cyan-100 uppercase tracking-widest opacity-90">Planilha Excel → aulas, sem duplicar (dedupe por Id Turma)</p>
                    </div>
                    <button onClick={handleClose} className="text-white font-black hover:text-black transition uppercase tracking-widest text-[10px]">Fechar [X]</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {error && <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300 font-medium">{error}</div>}

                    {stage === 'upload' && (
                        <>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                            <button onClick={() => fileRef.current?.click()}
                                className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-10 text-sm text-slate-500 hover:border-cyan-400 hover:text-cyan-600 transition font-medium">
                                Clique para selecionar a planilha (.xlsx) exportada do Power BI
                            </button>
                            <p className="text-[11px] text-slate-400">Espera as colunas: Id Turma · Curso · Componente Curricular · Instrutor · Data · Hora Início/Fim · Espaço Físico · Situação. Colunas extras são ignoradas.</p>
                        </>
                    )}

                    {(stage === 'parsing' || stage === 'saving') && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
                            <p className="text-sm font-medium">{stage === 'parsing' ? 'Lendo e checando duplicidade...' : 'Gravando aulas...'}</p>
                        </div>
                    )}

                    {stage === 'preview' && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-800"><p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{novas.length}</p><p className="text-[10px] text-emerald-600 uppercase font-bold tracking-widest">A importar</p></div>
                                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-700"><p className="text-2xl font-black text-slate-600 dark:text-slate-300">{qtdExistentes}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Já existiam</p></div>
                                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center border border-amber-100 dark:border-amber-800"><p className="text-2xl font-black text-amber-700 dark:text-amber-400">{qtdSemInstrutor}</p><p className="text-[10px] text-amber-600 uppercase font-bold tracking-widest">Sem instrutor</p></div>
                                <div className={`rounded-xl p-3 text-center border ${conflitos.length > 0 ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}><p className={`text-2xl font-black ${conflitos.length > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-400'}`}>{conflitos.length}</p><p className="text-[10px] text-rose-600 uppercase font-bold tracking-widest">Conflitos</p></div>
                            </div>
                            <p className="text-[11px] text-slate-400">{totalLidas} linhas lidas · {fileName} · {qtdInvalidas} inválida(s) ignorada(s). Já existentes (mesma turma+data+hora) são puladas. Sem instrutor = importa mesmo assim. Todas entram como "agendada".</p>

                            {conflitos.length > 0 && (
                                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-300 dark:border-rose-800 rounded-xl p-3">
                                    <p className="text-sm font-black text-rose-700 dark:text-rose-300 mb-2">⛔ Importação bloqueada — {conflitos.length} conflito(s) de instrutor. Corrija na planilha e reimporte.</p>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {conflitos.map((c, i) => (
                                            <div key={i} className="text-xs bg-white dark:bg-slate-800 rounded px-2 py-1 flex flex-wrap gap-x-3 gap-y-0.5 border border-rose-100 dark:border-rose-900/40">
                                                <span className="font-mono text-rose-600">Turma {c.idTurma}</span>
                                                <span>{c.data.split('-').reverse().join('/')} {c.inicio}</span>
                                                <span className="font-semibold">{c.instrutorNome}</span>
                                                <span className="text-slate-400 truncate">{c.curso}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-rose-500 mt-2">Motivo: esse instrutor já tem aula nesse mesmo dia e horário (no sistema ou repetida na planilha).</p>
                                </div>
                            )}

                            {novas.length > 0 && (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 sticky top-0"><tr>{['Turma', 'Data', 'Hora', 'Curso', 'Componente', 'Instrutor'].map(h => <th key={h} className="px-2 py-1.5 text-left font-black uppercase tracking-wide">{h}</th>)}</tr></thead>
                                        <tbody>
                                            {novas.slice(0, 50).map((p, i) => (
                                                <tr key={i} className="border-t border-slate-100 dark:border-slate-700/50">
                                                    <td className="px-2 py-1 font-mono">{p.idTurma}</td>
                                                    <td className="px-2 py-1 whitespace-nowrap">{p.data.split('-').reverse().join('/')}</td>
                                                    <td className="px-2 py-1 whitespace-nowrap font-mono">{p.inicio}-{p.fim}</td>
                                                    <td className="px-2 py-1 max-w-[140px] truncate" title={p.curso}>{p.curso}</td>
                                                    <td className="px-2 py-1 max-w-[120px] truncate" title={p.componente}>{p.componente}</td>
                                                    <td className={`px-2 py-1 ${p.instrutorId ? '' : 'text-amber-600'}`}>{p.instrutorNome || '—'}{!p.instrutorId && p.instrutorNome ? ' (?)' : ''}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {novas.length > 50 && <div className="px-2 py-1.5 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">+ {novas.length - 50} outras…</div>}
                                </div>
                            )}
                        </>
                    )}

                    {stage === 'done' && (
                        <div className="text-center py-10 space-y-3">
                            <span className="text-5xl font-black text-emerald-400 block">OK</span>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">{salvarResult.ok} aulas importadas!</h3>
                            <p className="text-sm text-slate-500">Elas já devem aparecer na agenda. Reimporte a planilha quando quiser — as que já existem serão puladas.</p>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex justify-end gap-3">
                    {stage === 'preview' && (
                        <>
                            <button onClick={reset} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300">Trocar planilha</button>
                            <button onClick={handleConfirmar} disabled={novas.length === 0 || conflitos.length > 0} className="px-5 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition" title={conflitos.length > 0 ? 'Corrija os conflitos antes de importar' : ''}>{conflitos.length > 0 ? 'Bloqueado por conflitos' : `Importar ${novas.length} aula(s)`}</button>
                        </>
                    )}
                    {(stage === 'upload' || stage === 'done') && (
                        <button onClick={handleClose} className="px-5 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition">{stage === 'done' ? 'Fechar' : 'Cancelar'}</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportarAgendaExcelModal;
