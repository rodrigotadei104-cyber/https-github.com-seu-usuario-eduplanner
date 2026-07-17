import React, { useState, useEffect, useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import { catalogoService } from '../services/catalogo.service';
import { turmaService } from '../services/turma.service';
import { supabase } from '../lib/supabase';
import { CatalogoCurso, DisciplinaCurso } from '../types';
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO, getDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

// Sessão que o usuário monta manualmente (em memória, antes de salvar)
interface Sessao {
    id: string;
    data: string;          // yyyy-MM-dd
    disciplinaId: string;
    materia: string;
    inicio: string;
    fim: string;
    instrutorId: string;
    instrutorNome: string;
    sala: string;
    extra: boolean;
}

const DIAS_SEMANA = [
    { v: 0, l: 'Dom' }, { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
    { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }
];

const CORES = ['#2563EB', '#059669', '#7C3AED', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#4338CA'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const uid = () => Math.random().toString(36).slice(2, 10);

export const GradePersonalizadaWizard: React.FC<Props> = ({ isOpen, onClose }) => {
    const { refreshData, instrutores, userProfile } = useSchedule();
    const tenantId = userProfile.tenantId;

    const [cursosBase, setCursosBase] = useState<CatalogoCurso[]>([]);
    const [disciplinas, setDisciplinas] = useState<DisciplinaCurso[]>([]);

    const [selectedCursoId, setSelectedCursoId] = useState('');
    const [nomeTurma, setNomeTurma] = useState('');
    const [salaPadrao, setSalaPadrao] = useState('');
    const [instrutorPadrao, setInstrutorPadrao] = useState('');

    const [mes, setMes] = useState<Date>(new Date());
    const [sessoes, setSessoes] = useState<Sessao[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Modal de adicionar/editar sessão
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Omit<Sessao, 'id'>>({
        data: '', disciplinaId: '', materia: '', inicio: '08:00', fim: '10:00',
        instrutorId: '', instrutorNome: '', sala: '', extra: false
    });

    // Modal "adicionar em série"
    const [serieOpen, setSerieOpen] = useState(false);
    const [serie, setSerie] = useState({ disciplinaId: '', dias: [] as number[], de: '', ate: '', inicio: '08:00', fim: '10:00', instrutorId: '', extra: false });

    useEffect(() => {
        if (isOpen) {
            (async () => {
                try { setCursosBase((await catalogoService.getCursos()).filter(c => c.ativo)); }
                catch (e) { console.error(e); }
            })();
        }
    }, [isOpen]);

    const cursoObj = cursosBase.find(c => c.id === selectedCursoId);
    const minutosPorHora = Number(cursoObj?.tipoHoraMin) || 60;

    const corDaMateria = (disciplinaId: string) => {
        const idx = Math.max(0, disciplinas.findIndex(d => d.id === disciplinaId));
        return CORES[idx % CORES.length];
    };

    const handleCursoChange = async (cursoId: string) => {
        setSelectedCursoId(cursoId);
        setDisciplinas([]);
        setSessoes([]);
        if (!cursoId) return;
        try { setDisciplinas(await catalogoService.getDisciplinasPorCurso(cursoId)); }
        catch (e) { console.error(e); }
    };

    // ---- calendário ----
    const gradeDias = useMemo(() => {
        const ini = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
        const fim = endOfWeek(endOfMonth(mes), { weekStartsOn: 0 });
        const dias: Date[] = [];
        let d = ini;
        while (d <= fim) { dias.push(d); d = addDays(d, 1); }
        return dias;
    }, [mes]);

    const sessoesPorDia = useMemo(() => {
        const map: Record<string, Sessao[]> = {};
        sessoes.forEach(s => { (map[s.data] ||= []).push(s); });
        Object.values(map).forEach(arr => arr.sort((a, b) => toMin(a.inicio) - toMin(b.inicio)));
        return map;
    }, [sessoes]);

    // ---- progresso por matéria ----
    const progresso = useMemo(() => {
        return disciplinas.map(d => {
            const horas = sessoes
                .filter(s => s.disciplinaId === d.id && !s.extra)
                .reduce((acc, s) => acc + (toMin(s.fim) - toMin(s.inicio)) / minutosPorHora, 0);
            return { disc: d, agendadas: Math.round(horas * 100) / 100, meta: d.cargaHoras };
        });
    }, [disciplinas, sessoes, minutosPorHora]);

    const totalExtras = sessoes.filter(s => s.extra).length;

    // ---- add/edit sessão ----
    const abrirNova = (dataStr: string) => {
        if (disciplinas.length === 0) { setError('Selecione um curso com matérias primeiro.'); return; }
        setError(null);
        setEditingId(null);
        const inst = instrutores.find(i => i.id === instrutorPadrao);
        const d0 = disciplinas[0];
        setForm({
            data: dataStr, disciplinaId: d0.id, materia: d0.nomeDisciplina,
            inicio: '08:00', fim: '10:00',
            instrutorId: instrutorPadrao, instrutorNome: inst?.nome || '',
            sala: salaPadrao, extra: false
        });
        setFormOpen(true);
    };

    const abrirEdicao = (s: Sessao) => {
        setEditingId(s.id);
        setForm({ ...s });
        setFormOpen(true);
    };

    const salvarForm = () => {
        if (!form.disciplinaId) { setError('Escolha a matéria.'); return; }
        if (!form.data || toMin(form.fim) <= toMin(form.inicio)) { setError('Horário inválido.'); return; }
        const disc = disciplinas.find(d => d.id === form.disciplinaId);
        const inst = instrutores.find(i => i.id === form.instrutorId);
        const payload: Sessao = {
            id: editingId || uid(),
            ...form,
            materia: disc?.nomeDisciplina || form.materia,
            instrutorNome: inst?.nome || ''
        };
        setSessoes(prev => editingId ? prev.map(s => s.id === editingId ? payload : s) : [...prev, payload]);
        setFormOpen(false);
        setError(null);
    };

    const removerSessao = (id: string) => setSessoes(prev => prev.filter(s => s.id !== id));

    // ---- adicionar em série ----
    const gerarSerie = () => {
        if (!serie.disciplinaId || serie.dias.length === 0 || !serie.de || !serie.ate) { setError('Preencha matéria, dias e período da série.'); return; }
        if (toMin(serie.fim) <= toMin(serie.inicio)) { setError('Horário da série inválido.'); return; }
        const disc = disciplinas.find(d => d.id === serie.disciplinaId);
        const inst = instrutores.find(i => i.id === serie.instrutorId);
        const novas: Sessao[] = [];
        let d = parseISO(serie.de);
        const ate = parseISO(serie.ate);
        let guard = 0;
        while (d <= ate && guard < 1000) {
            guard++;
            if (serie.dias.includes(getDay(d))) {
                novas.push({
                    id: uid(), data: format(d, 'yyyy-MM-dd'),
                    disciplinaId: serie.disciplinaId, materia: disc?.nomeDisciplina || '',
                    inicio: serie.inicio, fim: serie.fim,
                    instrutorId: serie.instrutorId, instrutorNome: inst?.nome || '',
                    sala: salaPadrao, extra: serie.extra
                });
            }
            d = addDays(d, 1);
        }
        if (novas.length === 0) { setError('Nenhuma data no período bateu com os dias escolhidos.'); return; }
        setSessoes(prev => [...prev, ...novas]);
        setSerieOpen(false);
        setError(null);
    };

    // ---- salvar turma ----
    const handleSalvar = async () => {
        if (!selectedCursoId) return setError('Selecione o curso.');
        if (!nomeTurma.trim()) return setError('Informe o nome/código da turma.');
        if (sessoes.length === 0) return setError('Adicione pelo menos uma aula ao calendário.');

        setIsSaving(true);
        try {
            const novaTurma = await turmaService.create({
                tenantId,
                numeroTurma: nomeTurma,
                cursoId: selectedCursoId,
                instrutorId: instrutorPadrao || undefined,
                salaPadrao: salaPadrao || undefined,
                dataInicio: [...sessoes].sort((a, b) => a.data.localeCompare(b.data))[0].data,
                diasSemanaSelecionados: [],
                horariosDoDia: [],
                datasBloqueadas: [],
                status: 'planejada'
            } as any);

            // Insert direto (isolado): grava todos os campos, inclusive aula_extra.
            const rows = sessoes.map(s => ({
                tenant_id: tenantId,
                data: s.data,
                horario_inicio: s.inicio,
                horario_fim: s.fim,
                disciplina_id: s.disciplinaId,
                numero_turma: nomeTurma,
                turma_id: novaTurma.id,
                sala: s.sala || null,
                instrutor_id: s.instrutorId || null,
                status: 'agendada',
                auto_gerada: false,
                aula_extra: s.extra,
                carga_horaria_materia: Math.round(((toMin(s.fim) - toMin(s.inicio)) / minutosPorHora) * 100) / 100
            }));

            const { error: errIns } = await supabase.from('aulas').insert(rows);
            if (errIns) throw new Error(errIns.message);

            alert(`Turma "${nomeTurma}" aberta! ${rows.length} aulas gravadas.`);
            await refreshData();
            handleClose();
        } catch (err: any) {
            setError('Erro ao salvar: ' + (err?.message || String(err)));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        setSelectedCursoId(''); setDisciplinas([]); setNomeTurma(''); setSalaPadrao(''); setInstrutorPadrao('');
        setSessoes([]); setMes(new Date()); setError(null); setFormOpen(false); setSerieOpen(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[95vw] xl:max-w-7xl overflow-hidden flex flex-col h-[95vh] border border-slate-200 dark:border-slate-700">
                {/* Header */}
                <div className="px-6 py-4 border-b border-teal-700 flex justify-between items-center bg-teal-600 dark:bg-teal-800">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-tighter">Construtor Manual de Turma</h2>
                        <p className="text-[10px] font-black text-teal-100 uppercase tracking-widest opacity-90">Monte a grade no calendário — datas, matérias, instrutores e extras</p>
                    </div>
                    <button onClick={handleClose} className="text-white font-black hover:text-black transition uppercase tracking-widest text-[10px]">Fechar [X]</button>
                </div>

                {/* Config topo */}
                <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50">
                    <select value={selectedCursoId} onChange={e => handleCursoChange(e.target.value)} className="p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700">
                        <option value="">Curso base...</option>
                        {cursosBase.map(c => <option key={c.id} value={c.id}>{c.nomeCurso}</option>)}
                    </select>
                    <input value={nomeTurma} onChange={e => setNomeTurma(e.target.value)} placeholder="Nome/código da turma" className="p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700" />
                    <input value={salaPadrao} onChange={e => setSalaPadrao(e.target.value)} placeholder="Sala padrão (opcional)" className="p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700" />
                    <select value={instrutorPadrao} onChange={e => setInstrutorPadrao(e.target.value)} className="p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700">
                        <option value="">Instrutor padrão (opcional)</option>
                        {instrutores.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                    </select>
                </div>

                {error && <div className="mx-6 mt-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-2.5 text-sm text-rose-700 dark:text-rose-300 font-medium">{error}</div>}

                {/* Corpo: calendário + progresso */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6 custom-scrollbar">
                    {/* Calendário */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1">
                                <button onClick={() => setMes(m => subMonths(m, 1))} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 font-black">‹</button>
                                <span className="font-bold text-sm min-w-[150px] text-center capitalize">{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</span>
                                <button onClick={() => setMes(m => addMonths(m, 1))} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 font-black">›</button>
                            </div>
                            <button onClick={() => { if (disciplinas.length === 0) { setError('Selecione um curso com matérias primeiro.'); return; } setError(null); setSerie(s => ({ ...s, disciplinaId: disciplinas[0]?.id || '', instrutorId: instrutorPadrao })); setSerieOpen(true); }}
                                className="text-[10px] font-black text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2.5 py-1.5 rounded uppercase tracking-widest">+ Adicionar em série</button>
                        </div>

                        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                            {DIAS_SEMANA.map(d => <div key={d.v} className="bg-slate-50 dark:bg-slate-800 text-center py-1.5 text-[10px] font-black text-slate-400 uppercase">{d.l}</div>)}
                            {gradeDias.map(dia => {
                                const ds = format(dia, 'yyyy-MM-dd');
                                const doMes = isSameMonth(dia, mes);
                                const hoje = isSameDay(dia, new Date());
                                const lista = sessoesPorDia[ds] || [];
                                return (
                                    <div key={ds} onClick={() => doMes && abrirNova(ds)}
                                        className={`min-h-[118px] p-1.5 bg-white dark:bg-slate-900 ${doMes ? 'cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-900/10' : 'opacity-40'} transition`}>
                                        <div className={`text-[11px] font-bold mb-1 ${hoje ? 'text-teal-600' : 'text-slate-400'}`}>{format(dia, 'd')}</div>
                                        <div className="space-y-0.5">
                                            {lista.map(s => (
                                                <button key={s.id} onClick={(e) => { e.stopPropagation(); abrirEdicao(s); }}
                                                    className="w-full text-left rounded px-1 py-0.5 text-white text-[9px] leading-tight truncate"
                                                    style={{ background: s.extra ? '#d97706' : corDaMateria(s.disciplinaId) }}
                                                    title={`${s.inicio}-${s.fim} ${s.materia}${s.extra ? ' (EXTRA)' : ''}`}>
                                                    <span className="font-bold">{s.inicio}</span> {s.extra ? '⚡' : ''}{s.materia}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">Clique num dia para adicionar uma aula · clique numa aula para editar/remover · laranja = extra.</p>
                    </div>

                    {/* Progresso lateral */}
                    <div className="lg:w-72 shrink-0">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Progresso por matéria</h3>
                        {disciplinas.length === 0 ? (
                            <p className="text-sm text-slate-400">Selecione um curso.</p>
                        ) : (
                            <div className="space-y-2">
                                {progresso.map(({ disc, agendadas, meta }) => {
                                    const pct = meta > 0 ? Math.min(100, (agendadas / meta) * 100) : 0;
                                    const completo = agendadas >= meta && meta > 0;
                                    return (
                                        <div key={disc.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 border border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="font-bold truncate flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: corDaMateria(disc.id) }} />{disc.nomeDisciplina}</span>
                                                <span className={`font-black ${completo ? 'text-emerald-600' : 'text-slate-500'}`}>{agendadas}/{meta}h</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className={`h-full ${completo ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="flex items-center justify-between text-xs pt-1">
                                    <span className="font-bold text-amber-600">⚡ Extras</span>
                                    <span className="font-black text-amber-600">{totalExtras}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{sessoes.length} aula(s) no calendário</span>
                    <div className="flex gap-3">
                        <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300">Cancelar</button>
                        <button onClick={handleSalvar} disabled={isSaving || sessoes.length === 0} className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-40 transition">{isSaving ? 'Salvando...' : 'Abrir turma'}</button>
                    </div>
                </div>
            </div>

            {/* Modal: adicionar/editar sessão */}
            {formOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setFormOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <h3 className="font-black text-slate-800 dark:text-white">{editingId ? 'Editar aula' : 'Nova aula'} · {form.data && format(parseISO(form.data), 'dd/MM/yyyy')}</h3>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Matéria</label>
                            <select value={form.disciplinaId} onChange={e => setForm(f => ({ ...f, disciplinaId: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600">
                                {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nomeDisciplina} ({d.cargaHoras}h)</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Início</label><input type="time" value={form.inicio} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Fim</label><input type="time" value={form.fim} onChange={e => setForm(f => ({ ...f, fim: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Instrutor</label>
                                <select value={form.instrutorId} onChange={e => setForm(f => ({ ...f, instrutorId: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600">
                                    <option value="">— sem —</option>
                                    {instrutores.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Sala</label><input value={form.sala} onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 cursor-pointer">
                            <input type="checkbox" checked={form.extra} onChange={e => setForm(f => ({ ...f, extra: e.target.checked }))} /> ⚡ Aula extra (prática / simulador)
                        </label>
                        <div className="flex justify-between gap-2 pt-1">
                            {editingId ? <button onClick={() => { removerSessao(editingId); setFormOpen(false); }} className="px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg">Remover</button> : <span />}
                            <div className="flex gap-2">
                                <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
                                <button onClick={salvarForm} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg">{editingId ? 'Salvar' : 'Adicionar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: adicionar em série */}
            {serieOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setSerieOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <h3 className="font-black text-slate-800 dark:text-white">Adicionar em série</h3>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Matéria</label>
                            <select value={serie.disciplinaId} onChange={e => setSerie(s => ({ ...s, disciplinaId: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600">
                                {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nomeDisciplina}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Dias da semana</label>
                            <div className="flex flex-wrap gap-1">
                                {DIAS_SEMANA.map(d => (
                                    <button key={d.v} type="button" onClick={() => setSerie(s => ({ ...s, dias: s.dias.includes(d.v) ? s.dias.filter(x => x !== d.v) : [...s.dias, d.v] }))}
                                        className={`w-9 h-8 rounded text-[11px] font-black ${serie.dias.includes(d.v) ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>{d.l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">De</label><input type="date" value={serie.de} onChange={e => setSerie(s => ({ ...s, de: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Até</label><input type="date" value={serie.ate} onChange={e => setSerie(s => ({ ...s, ate: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Início</label><input type="time" value={serie.inicio} onChange={e => setSerie(s => ({ ...s, inicio: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                            <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Fim</label><input type="time" value={serie.fim} onChange={e => setSerie(s => ({ ...s, fim: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600" /></div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Instrutor</label>
                            <select value={serie.instrutorId} onChange={e => setSerie(s => ({ ...s, instrutorId: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600">
                                <option value="">— sem —</option>
                                {instrutores.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-amber-700 cursor-pointer"><input type="checkbox" checked={serie.extra} onChange={e => setSerie(s => ({ ...s, extra: e.target.checked }))} /> ⚡ Marcar como extra</label>
                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => setSerieOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
                            <button onClick={gerarSerie} className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg">Gerar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GradePersonalizadaWizard;
