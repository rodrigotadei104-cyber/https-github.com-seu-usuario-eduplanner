import React, { useState, useMemo, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { AulaMapaSala } from '../services/aula.service';
import { Aula } from '../types';
import * as XLSX from 'xlsx-js-style';

// ============================================
// HELPERS
// ============================================

const DARK_COLORS = [
    '#059669', // Emerald 600
    '#7C3AED', // Violet 600
    '#DC2626', // Red 600
    '#D97706', // Amber 600
    '#2563EB', // Blue 600
    '#0891b2', // Cyan 600
    '#4F46E5', // Indigo 600
    '#be185d', // Pink 700
];

const getCourseColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return DARK_COLORS[Math.abs(hash) % DARK_COLORS.length];
};

// Tons claros (pastel) para preenchimento de célula no Excel — mesma ordem de DARK_COLORS.
const LIGHT_FILLS = [
    'D1FAE5', // Emerald
    'EDE9FE', // Violet
    'FEE2E2', // Red
    'FEF3C7', // Amber
    'DBEAFE', // Blue
    'CFFAFE', // Cyan
    'E0E7FF', // Indigo
    'FCE7F3', // Pink
];

// Cor de fundo (hex sem #) para o Excel: programas = âmbar; cursos = pastel por hash.
const getCourseFill = (name: string, isProgram: boolean): string => {
    if (isProgram) return 'FEF3C7';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return LIGHT_FILLS[Math.abs(hash) % LIGHT_FILLS.length];
};

const toMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

const calcDurationHours = (aula: AulaMapaSala): number => {
    const mins = toMinutes(aula.horarioFim) - toMinutes(aula.horarioInicio);
    return mins > 0 ? Math.round((mins / (aula.minutosPorHora || 60)) * 100) / 100 : 0;
};

// Rótulo e cor por tipo de evento (para exibir eventos no Mapa de Salas).
const EVENTO_LABEL: Record<string, string> = {
    reuniao: 'Reunião', treinamento: 'Treinamento', feedback: 'Feedback', ferias: 'Férias', outro: 'Evento'
};
const EVENTO_COR: Record<string, string> = {
    reuniao: '#4F46E5', treinamento: '#0891b2', feedback: '#7C3AED', ferias: '#e11d48', outro: '#64748b'
};

interface BlocoSalaConsolidado {
    id: string;
    inicio: string;
    fim: string;
    curso: string;
    instrutor: string;
    numeroTurma?: string;
    isProgram: boolean;
    origem?: string;
    isCancelada: boolean;
    conflito: boolean;
    aula: AulaMapaSala;
}

// Consolida aulas do MESMO curso na mesma célula (sala/dia) em UM bloco: do 1º início ao último fim.
// Conflito passa a valer só entre CURSOS DIFERENTES que se sobrepõem no tempo (conflito real de sala).
const consolidarSalaCelula = (aulas: AulaMapaSala[]): BlocoSalaConsolidado[] => {
    const grupos = new Map<string, AulaMapaSala[]>();
    aulas.forEach(a => {
        const isProg = a.tipoAula === 'PROGRAMA';
        const turma = a.numeroTurma || '';
        const chave = isProg ? `P:${a.origem || a.curso}:${turma}` : `C:${a.curso}:${turma}`;
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave)!.push(a);
    });
    const blocos: BlocoSalaConsolidado[] = [];
    for (const grp of grupos.values()) {
        const ord = grp.slice().sort((x, y) => toMinutes(x.horarioInicio) - toMinutes(y.horarioInicio));
        const rep = ord[0];
        let fim = rep.horarioFim;
        ord.forEach(a => { if (toMinutes(a.horarioFim) > toMinutes(fim)) fim = a.horarioFim; });
        blocos.push({
            id: rep.id, inicio: rep.horarioInicio, fim,
            curso: rep.curso, instrutor: rep.instrutor, numeroTurma: rep.numeroTurma,
            isProgram: rep.tipoAula === 'PROGRAMA', origem: rep.origem,
            isCancelada: grp.every(a => a.status === 'cancelada'),
            conflito: false, aula: rep
        });
    }
    for (let i = 0; i < blocos.length; i++)
        for (let j = i + 1; j < blocos.length; j++) {
            const a = blocos[i], b = blocos[j];
            if (toMinutes(a.inicio) < toMinutes(b.fim) && toMinutes(a.fim) > toMinutes(b.inicio)) {
                a.conflito = true; b.conflito = true;
            }
        }
    return blocos.sort((x, y) => toMinutes(x.inicio) - toMinutes(y.inicio));
};

const detectarConflitos = (aulas: AulaMapaSala[]): Set<string> => {
    const conflitantes = new Set<string>();
    const ativas = aulas.filter(a => a.status !== 'cancelada');
    for (let i = 0; i < ativas.length; i++) {
        for (let j = i + 1; j < ativas.length; j++) {
            const a = ativas[i];
            const b = ativas[j];
            if (a.salaId !== b.salaId || a.salaId === 'sem-sala') continue;
            if (a.data !== b.data) continue;
            const aStart = toMinutes(a.horarioInicio);
            const aEnd = toMinutes(a.horarioFim);
            const bStart = toMinutes(b.horarioInicio);
            const bEnd = toMinutes(b.horarioFim);
            if (aStart < bEnd && aEnd > bStart) {
                conflitantes.add(a.id);
                conflitantes.add(b.id);
            }
        }
    }
    return conflitantes;
};

const statusLabel = (s: string) => {
    switch (s) {
        case 'agendada': return 'Agendada';
        case 'em_andamento': return 'Em Andamento';
        case 'concluida': return 'ConcluÃ­da';
        case 'cancelada': return 'Cancelada';
        default: return s;
    }
};

const statusBadge = (s: string) => {
    switch (s) {
        case 'agendada': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
        case 'em_andamento': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        case 'concluida': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
        case 'cancelada': return 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-gray-500';
        default: return 'bg-gray-100 text-gray-600';
    }
};

interface RoomMapViewProps {
    onEditAula?: (aula: Aula) => void;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export const RoomMapView: React.FC<RoomMapViewProps> = ({ onEditAula }) => {
    const { aulas: aulasGlobais, eventos, instrutores, isLoading, feriadosSet, feriados } = useSchedule();
    const [semanaBase, setSemanaBase] = useState<Date>(new Date());
    const [aba, setAba] = useState<'grade' | 'lista' | 'dia'>('grade');
    const [filtroBusca, setFiltroBusca] = useState('');
    const [filtroSala, setFiltroSala] = useState('');
    const [filtroInstrutor, setFiltroInstrutor] = useState('');
    const [diaSelecionado, setDiaSelecionado] = useState<Date>(new Date());

    // Semana: segunda -> domingo
    const inicioSemana = useMemo(() => startOfWeek(semanaBase, { weekStartsOn: 1 }), [semanaBase]);
    const fimSemana = useMemo(() => endOfWeek(semanaBase, { weekStartsOn: 1 }), [semanaBase]);
    const diasDaSemana = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i)),
        [inicioSemana]
    );

    // --- DATA REATIVIDADE ---
    // Filtra e transforma as aulas do contexto para o formato do Mapa de Salas
    const aulas = useMemo((): AulaMapaSala[] => {
        const diaInicioStr = format(inicioSemana, 'yyyy-MM-dd');
        const diaFimStr = format(fimSemana, 'yyyy-MM-dd');

        const daAulas: AulaMapaSala[] = (aulasGlobais as Aula[])
            .filter(a => {
                const dataStr = String(a.data).split('T')[0];
                const realData = a.data instanceof Date ? format(a.data, 'yyyy-MM-dd') : dataStr;
                return realData >= diaInicioStr && realData <= diaFimStr;
            })
            .map(a => {
                const pureDateStr = String(a.data).split('T')[0];
                return {
                    id: a.id,
                    data: a.data instanceof Date ? format(a.data, 'yyyy-MM-dd') : pureDateStr,
                    horarioInicio: a.horarioInicio,
                    horarioFim: a.horarioFim,
                    salaId: a.sala || 'sem-sala',
                sala: a.sala || 'Sem sala definida',
                curso: a.curso,
                materia: a.materia,
                instrutor: a.instrutor,
                cor: a.cor,
                status: a.status,
                minutosPorHora: a.minutosPorHora,
                tipoAula: a.tipoAula,
                origem: a.origem,
                numeroTurma: a.numeroTurma
                };
            });

        // Eventos COM sala também ocupam a sala — entram no Mapa de Salas.
        const dosEventos: AulaMapaSala[] = (eventos || [])
            .filter(e => {
                if (!e.sala || !String(e.sala).trim()) return false;
                const realData = e.data instanceof Date ? format(e.data, 'yyyy-MM-dd') : String(e.data).split('T')[0];
                return realData >= diaInicioStr && realData <= diaFimStr;
            })
            .map(e => {
                const realData = e.data instanceof Date ? format(e.data, 'yyyy-MM-dd') : String(e.data).split('T')[0];
                const instrNome = e.instrutorId ? (instrutores.find(i => i.id === e.instrutorId)?.nome || '') : '';
                return {
                    id: e.id,
                    data: realData,
                    horarioInicio: e.horarioInicio,
                    horarioFim: e.horarioFim,
                    salaId: e.sala as string,
                    sala: e.sala as string,
                    curso: e.nome,
                    materia: EVENTO_LABEL[e.tipo] || 'Evento',
                    instrutor: instrNome,
                    cor: EVENTO_COR[e.tipo] || '#64748b',
                    status: e.status === 'cancelado' ? 'cancelada' : 'agendada',
                    minutosPorHora: 60,
                    tipoAula: 'EVENTO',
                    origem: EVENTO_LABEL[e.tipo] || 'Evento',
                    numeroTurma: undefined
                } as AulaMapaSala;
            });

        return [...daAulas, ...dosEventos];
    }, [aulasGlobais, eventos, instrutores, inicioSemana, fimSemana]);

    const conflitantes = useMemo(() => detectarConflitos(aulas), [aulas]);
    const aulasAtivas = useMemo(() => aulas.filter(a => a.status !== 'cancelada'), [aulas]);
    const salasUnicas = useMemo(() =>
        [...new Map(aulasAtivas.map(a => [a.salaId, a.sala])).entries()]
            .sort((a, b) => a[1].localeCompare(b[1])),
        [aulasAtivas]
    );
    const totalHoras = useMemo(
        () => aulasAtivas.reduce((acc, a) => acc + calcDurationHours(a), 0),
        [aulasAtivas]
    );
    const numConflitos = Math.floor(conflitantes.size / 2);

    const instrutoresUnicos = useMemo(() =>
        [...new Set(aulasAtivas.map(a => a.instrutor))].sort((a, b) => a.localeCompare(b)),
        [aulasAtivas]
    );

    const grade = useMemo(() => {
        const idx: Record<string, Record<string, AulaMapaSala[]>> = {};
        for (const [salaId] of salasUnicas) {
            idx[salaId] = {};
            for (const dia of diasDaSemana) {
                idx[salaId][format(dia, 'yyyy-MM-dd')] = [];
            }
        }
        for (const aula of aulasAtivas) {
            if (idx[aula.salaId]?.[aula.data] !== undefined) {
                idx[aula.salaId][aula.data].push(aula);
                idx[aula.salaId][aula.data].sort((a, b) =>
                    a.horarioInicio.localeCompare(b.horarioInicio));
            }
        }
        return idx;
    }, [salasUnicas, diasDaSemana, aulasAtivas]);

    const aulasFiltradas = useMemo(() => {
        let lista = [...aulas];
        if (filtroSala) lista = lista.filter(a => a.salaId === filtroSala);
        if (filtroInstrutor) lista = lista.filter(a => a.instrutor === filtroInstrutor);
        if (filtroBusca) {
            const q = filtroBusca.toLowerCase();
            lista = lista.filter(a =>
                a.curso.toLowerCase().includes(q) ||
                a.instrutor.toLowerCase().includes(q) ||
                a.sala.toLowerCase().includes(q) ||
                a.materia.toLowerCase().includes(q)
            );
        }
        return lista.sort((a, b) =>
            a.data !== b.data
                ? a.data.localeCompare(b.data)
                : a.horarioInicio.localeCompare(b.horarioInicio)
        );
    }, [aulas, filtroBusca, filtroSala, filtroInstrutor]);

    // Aulas do dia selecionado para o modo Dia
    const diaSelecionadoStr = useMemo(() => format(diaSelecionado, 'yyyy-MM-dd'), [diaSelecionado]);
    const aulasFiltradasDia = useMemo(() => {
        let lista = aulasAtivas.filter(a => a.data === diaSelecionadoStr);
        if (filtroInstrutor) lista = lista.filter(a => a.instrutor === filtroInstrutor);
        return lista.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
    }, [aulasAtivas, diaSelecionadoStr, filtroInstrutor]);

    const salasDia = useMemo(() =>
        [...new Map(aulasFiltradasDia.map(a => [a.salaId, a.sala])).entries()]
            .sort((a, b) => a[1].localeCompare(b[1])),
        [aulasFiltradasDia]
    );

    const handleClickAula = useCallback((aula: AulaMapaSala) => {
        if (!onEditAula) return;
        onEditAula({
            id: aula.id,
            tenantId: '',
            data: aula.data as any,
            horarioInicio: aula.horarioInicio,
            horarioFim: aula.horarioFim,
            instrutor: aula.instrutor,
            curso: aula.curso,
            materia: aula.materia,
            sala: aula.sala,
            status: aula.status as any,
            cor: aula.cor
        });
    }, [onEditAula]);

    const exportarExcel = useCallback(() => {
        const wb = XLSX.utils.book_new();
        const diasHeader = diasDaSemana.map(d => format(d, 'EEE dd/MM', { locale: ptBR }));
        const labelS = `${format(inicioSemana, 'dd/MM', { locale: ptBR })} - ${format(fimSemana, 'dd/MM/yyyy', { locale: ptBR })}`;
        const geradoEm = format(new Date(), "dd/MM/yyyy 'as' HH:mm");

        // Paleta / estilos reutilizaveis
        const COR = {
            titulo: '0F172A', header: '1E293B', branco: 'FFFFFF',
            sub: '475569', borda: 'CBD5E1', zebra: 'F1F5F9',
            sala: 'E2E8F0', confFill: 'FECACA', confText: 'B91C1C', texto: '1E293B'
        };
        const thin = { style: 'thin', color: { rgb: COR.borda } };
        const bordas = { top: thin, bottom: thin, left: thin, right: thin };
        const sTitulo = { font: { bold: true, sz: 14, color: { rgb: COR.branco } }, fill: { fgColor: { rgb: COR.titulo } }, alignment: { horizontal: 'left', vertical: 'center' } };
        const sSub = { font: { italic: true, sz: 9, color: { rgb: COR.sub } }, alignment: { horizontal: 'left', vertical: 'center' } };
        const sHeader = { font: { bold: true, sz: 10, color: { rgb: COR.branco } }, fill: { fgColor: { rgb: COR.header } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bordas };
        const sSala = { font: { bold: true, sz: 10, color: { rgb: COR.texto } }, fill: { fgColor: { rgb: COR.sala } }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: bordas };

        const setStyle = (ws: any, r: number, c: number, s: any) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = s;
        };

        // ABA 1: GRADE SEMANAL ESTILIZADA
        const nDias = diasDaSemana.length;
        const gradeAoA: (string | number)[][] = [
            [`MAPA DE SALAS   -   ${labelS}   -   ${aulasAtivas.length} aulas   -   ${totalHoras.toFixed(1)}h${numConflitos > 0 ? `   -   ${numConflitos} conflito(s)` : ''}`, ...Array(nDias).fill('')],
            [`Gerado em ${geradoEm}`, ...Array(nDias).fill('')],
            ['SALA', ...diasHeader.map(d => d.toUpperCase())]
        ];
        const gradeMeta: Record<string, { conf: boolean; fill: string }> = {};
        salasUnicas.forEach(([salaId, salaNome], si) => {
            const r = 3 + si;
            const rowVals: (string | number)[] = [salaNome];
            diasDaSemana.forEach((dia, di) => {
                const c = 1 + di;
                const ac = grade[salaId]?.[format(dia, 'yyyy-MM-dd')] || [];
                if (ac.length === 0) { rowVals.push(''); return; }
                const blocos = consolidarSalaCelula(ac);
                rowVals.push(blocos.map(b => {
                    const label = b.isProgram ? (b.origem || 'Programa') : b.curso;
                    return `${(b.inicio || '').slice(0, 5)}-${(b.fim || '').slice(0, 5)}   ${label}${b.numeroTurma ? '  #' + b.numeroTurma : ''}\n${b.instrutor}`;
                }).join('\n\n'));
                const conf = blocos.some(b => b.conflito);
                const fill = conf ? COR.confFill
                    : blocos.length === 1
                        ? getCourseFill(blocos[0].isProgram ? (blocos[0].origem || blocos[0].curso) : blocos[0].curso, blocos[0].isProgram)
                        : COR.branco;
                gradeMeta[`${r},${c}`] = { conf, fill };
            });
            gradeAoA.push(rowVals);
        });

        const wsGrade = XLSX.utils.aoa_to_sheet(gradeAoA);
        wsGrade['!cols'] = [{ wch: 22 }, ...diasHeader.map(() => ({ wch: 30 }))];
        wsGrade['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 20 }];
        wsGrade['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: nDias } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: nDias } }
        ];
        setStyle(wsGrade, 0, 0, sTitulo);
        setStyle(wsGrade, 1, 0, sSub);
        for (let c = 0; c <= nDias; c++) setStyle(wsGrade, 2, c, sHeader);
        salasUnicas.forEach((_, si) => {
            const r = 3 + si;
            setStyle(wsGrade, r, 0, sSala);
            for (let di = 0; di < nDias; di++) {
                const c = 1 + di;
                const meta = gradeMeta[`${r},${c}`];
                setStyle(wsGrade, r, c, {
                    font: { sz: 9, color: { rgb: meta?.conf ? COR.confText : COR.texto } },
                    fill: { fgColor: { rgb: meta?.fill || COR.branco } },
                    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
                    border: bordas
                });
            }
        });
        XLSX.utils.book_append_sheet(wb, wsGrade, 'Grade Semanal');

        // ABA 2: TABELA LIMPA (LISTA)
        const cols = ['SALA', 'DATA', 'INICIO', 'FIM', 'DURACAO (h)', 'CURSO', 'MATERIA', 'INSTRUTOR', 'TURMA', 'STATUS', 'CONFLITO'];
        const nCol = cols.length;
        const listaAoA: (string | number)[][] = [
            [`LISTA DE AULAS   -   ${labelS}`, ...Array(nCol - 1).fill('')],
            [`${aulasFiltradas.length} aula(s)   -   Gerado em ${geradoEm}`, ...Array(nCol - 1).fill('')],
            cols,
            ...aulasFiltradas.map(a => [
                a.sala,
                format(parseISO(a.data + 'T00:00:00'), 'EEE dd/MM/yyyy', { locale: ptBR }),
                (a.horarioInicio || '').slice(0, 5),
                (a.horarioFim || '').slice(0, 5),
                calcDurationHours(a),
                a.curso,
                a.materia,
                a.instrutor,
                a.numeroTurma || '-',
                statusLabel(a.status),
                conflitantes.has(a.id) ? 'SIM' : '-'
            ])
        ];
        const wsLista = XLSX.utils.aoa_to_sheet(listaAoA);
        wsLista['!cols'] = [
            { wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 11 },
            { wch: 32 }, { wch: 24 }, { wch: 26 }, { wch: 9 }, { wch: 14 }, { wch: 10 }
        ];
        wsLista['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 20 }];
        wsLista['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: nCol - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: nCol - 1 } }
        ];
        const centradas = new Set([2, 3, 4, 8, 10]); // inicio, fim, duracao, turma, conflito
        setStyle(wsLista, 0, 0, sTitulo);
        setStyle(wsLista, 1, 0, sSub);
        for (let c = 0; c < nCol; c++) setStyle(wsLista, 2, c, sHeader);
        aulasFiltradas.forEach((a, ai) => {
            const r = 3 + ai;
            const conf = conflitantes.has(a.id);
            const zebra = ai % 2 === 1;
            for (let c = 0; c < nCol; c++) {
                setStyle(wsLista, r, c, {
                    font: { sz: 9, color: { rgb: conf ? COR.confText : COR.texto }, bold: conf && c === nCol - 1 },
                    fill: { fgColor: { rgb: conf ? COR.confFill : zebra ? COR.zebra : COR.branco } },
                    alignment: { horizontal: centradas.has(c) ? 'center' : 'left', vertical: 'center' },
                    border: bordas
                });
            }
        });
        XLSX.utils.book_append_sheet(wb, wsLista, 'Lista de Aulas');

        XLSX.writeFile(wb, `MapaDeSalas_${format(inicioSemana, 'ddMMyyyy')}-${format(fimSemana, 'ddMMyyyy')}.xlsx`);
    }, [aulasFiltradas, salasUnicas, grade, diasDaSemana, conflitantes, inicioSemana, fimSemana, aulasAtivas, totalHoras, numConflitos]);

    const exportarPDF = useCallback(() => {
        const win = window.open('', '_blank', 'width=1280,height=900');
        if (!win) { alert('Permita pop-ups para gerar o PDF.'); return; }

        const labelS = `${format(inicioSemana, 'dd/MM', { locale: ptBR })} - ${format(fimSemana, 'dd/MM/yyyy', { locale: ptBR })}`;
        const hojeStr = format(new Date(), 'yyyy-MM-dd');

        const theadCells = diasDaSemana.map(dia => {
            const dStr = format(dia, 'yyyy-MM-dd');
            const isH = dStr === hojeStr;
            return `<th style="background:${isH ? '#1d4ed8' : '#1e293b'};color:#fff;padding:7px 5px;text-align:center;min-width:110px;border:1px solid #334155">
                <div style="font-size:8px;color:${isH ? '#bfdbfe' : '#94a3b8'};letter-spacing:.08em;font-weight:700">${format(dia, 'EEE', { locale: ptBR }).toUpperCase()}</div>
                <div style="font-size:13px;font-weight:800">${format(dia, 'dd/MM')}</div>
            </th>`;
        }).join('');

        const tbodyRows = salasUnicas.map(([salaId, salaNome], i) => {
            const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            const cells = diasDaSemana.map(dia => {
                const dStr = format(dia, 'yyyy-MM-dd');
                const isH = dStr === hojeStr;
                const ac = grade[salaId]?.[dStr] || [];
                const cards = ac.length === 0
                    ? '<span style="color:#cbd5e1;font-size:10px">-</span>'
                    : consolidarSalaCelula(ac).map(b => {
                        const isC = b.conflito;
                        const cor = b.isProgram ? '#d97706' : getCourseColor(b.curso);
                        const label = b.isProgram ? (b.origem || 'Programa') : b.curso;
                        return `<div style="background:${isC ? '#fef2f2' : `${cor}18`};border-left:3px solid ${isC ? '#f87171' : cor};border-radius:4px;padding:3px 6px;margin-bottom:3px">
                            <div style="font-size:8.5px;font-weight:700;color:${isC ? '#b91c1c' : '#0f172a'}">${(b.inicio || '').slice(0, 5)}-${(b.fim || '').slice(0, 5)}${isC ? ' âš ' : ''}</div>
                            <div style="font-size:9.5px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:125px">${label}</div>
                            <div style="font-size:8px;color:#94a3b8">${b.instrutor.split(' ')[0]}${b.numeroTurma ? ' · #' + b.numeroTurma : ''}</div>
                        </div>`;
                    }).join('');
                return `<td style="border:1px solid #e2e8f0;padding:4px 5px;vertical-align:top;background:${isH ? 'rgba(219,234,254,0.3)' : bg}">${cards}</td>`;
            }).join('');
            return `<tr>
                <td style="border:1px solid #e2e8f0;padding:6px 10px;font-weight:600;font-size:10px;color:#334155;background:${bg};vertical-align:top">${salaNome}</td>
                ${cells}
            </tr>`;
        }).join('');

        win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Mapa de Salas - ${labelS}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Arial,sans-serif;font-size:11px;color:#1e293b;background:#f1f5f9;padding:16px}
    .topbar{margin-bottom:14px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#0f172a;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px}
    .btn.sec{background:#475569}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 6px rgba(0,0,0,.08);padding:14px 18px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
    .title{font-size:22px;font-weight:800;color:#0f172a}
    .sub{font-size:11px;color:#64748b;margin-top:3px}
    .stats{display:flex;gap:18px}
    .stat{display:flex;align-items:center;gap:6px;font-size:11px;color:#475569}
    .stat strong{font-size:14px;font-weight:800;color:#0f172a}
    .stat.danger strong{color:#dc2626}
    table{border-collapse:collapse;width:100%}
    th{font-weight:700;white-space:nowrap}
    td{min-height:50px}
    @media print{
      body{padding:0;background:white}
      .topbar{display:none!important}
      .card{box-shadow:none;border-radius:0;padding:0}
      .hdr{padding:6px 0;border-bottom:2px solid #e2e8f0;margin-bottom:8px}
      @page{size:landscape;margin:8mm}
    }
  </style>
</head>
<body>
  <div class="topbar">
    <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
    <button class="btn sec" onclick="window.close()">Fechar</button>
  </div>
  <div class="card">
    <div class="hdr">
      <div>
        <div class="title">Mapa de Salas</div>
        <div class="sub">${labelS} &nbsp;Â·&nbsp; Gerado em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}</div>
      </div>
      <div class="stats">
        <div class="stat">ðŸ“š Aulas <strong>${aulasAtivas.length}</strong></div>
        <div class="stat">â± Horas <strong>${totalHoras.toFixed(1)}h</strong></div>
        <div class="stat">ðŸ« Salas <strong>${salasUnicas.length}</strong></div>
        ${numConflitos > 0 ? `<div class="stat danger">âš  Conflitos <strong>${numConflitos}</strong></div>` : ''}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="background:#1e293b;color:#f8fafc;padding:8px 10px;text-align:left;min-width:140px;border:1px solid #334155;font-size:9px;letter-spacing:.05em">SALA</th>
          ${theadCells}
        </tr>
      </thead>
      <tbody>${tbodyRows}</tbody>
    </table>
    ${numConflitos > 0 ? `<p style="font-size:10px;color:#dc2626;margin-top:10px">âš  ${numConflitos} conflito(s) de horÃ¡rio detectado(s)</p>` : ''}
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
</body>
</html>`);
        win.document.close();
    }, [diasDaSemana, salasUnicas, grade, conflitantes, inicioSemana, fimSemana, aulasAtivas, totalHoras, numConflitos]);

    const labelSemana = `${format(inicioSemana, 'dd/MM', { locale: ptBR })} - ${format(fimSemana, 'dd/MM/yyyy', { locale: ptBR })}`;
    const hoje = format(new Date(), 'yyyy-MM-dd');

    // ============================================
    // RENDER
    // ============================================
    return (
        <>
            <style>{`
                @media print {
                    body > * { display: none !important; }
                    #rmap-root  { display: block !important; }
                    .no-print   { display: none !important; }
                    #rmap-table { min-width: 100% !important; }
                }
            `}</style>

            {/*
                Layout: coluna flex com altura total.
                Container da tabela usa position:absolute para escapar
                de qualquer overflow-hidden na hierarquia pai.
            */}
            <div
                id="rmap-root"
                style={{
                    height: 'calc(100vh - 150px)',
                    minHeight: '600px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}
            >
                {/* â”€â”€ BARRA DE CONTROLES â”€â”€ */}
                <div className="no-print flex flex-wrap items-center justify-between gap-2" style={{ flexShrink: 0 }}>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSemanaBase(p => subWeeks(p, 1))}
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors font-black"
                        >
                            &lt;
                        </button>
                        <span className="font-bold text-gray-800 dark:text-gray-100 text-[11px] min-w-[162px] text-center uppercase tracking-widest">
                            {labelSemana}
                        </span>
                        <button
                            onClick={() => setSemanaBase(p => addWeeks(p, 1))}
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors font-black"
                        >
                            &gt;
                        </button>
                        <button
                            onClick={() => setSemanaBase(new Date())}
                            className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded-md hover:bg-blue-50 transition dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                        >
                            Hoje
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
                            {(['grade', 'lista', 'dia'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => {
                                        setAba(t);
                                        if (t === 'dia') setDiaSelecionado(inicioSemana);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all
                                        ${aba === t
                                            ? 'bg-blue-600 shadow text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                        }`}
                                >
                                    {t === 'grade' ? 'Grade' : t === 'lista' ? 'Lista' : 'Dia'}
                                </button>
                            ))}
                        </div>

                        {instrutoresUnicos.length > 0 && (
                            <select
                                value={filtroInstrutor}
                                onChange={e => setFiltroInstrutor(e.target.value)}
                                className="text-xs border border-gray-200 dark:border-slate-600 rounded-lg pl-2 pr-6 py-1 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                title="Filtrar por instrutor"
                            >
                                <option value="">Todos instrutores</option>
                                {instrutoresUnicos.map(inst => (
                                    <option key={inst} value={inst}>{inst}</option>
                                ))}
                            </select>
                        )}

                        <button
                            onClick={exportarExcel}
                            disabled={isLoading || aulas.length === 0}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Excel
                        </button>
                        <button
                            onClick={exportarPDF}
                            disabled={isLoading || aulas.length === 0}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            PDF
                        </button>
                    </div>
                </div>

                {/* â”€â”€ INDICADORES â”€â”€ */}
                <div className="no-print flex items-center gap-4 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex-wrap" style={{ flexShrink: 0 }}>
                    {[
                        { label: 'Aulas', value: aulasAtivas.length, color: 'text-blue-600' },
                        { label: 'Horas', value: `${totalHoras.toFixed(1)}h`, color: 'text-indigo-600' },
                        { label: 'Salas', value: salasUnicas.length, color: 'text-emerald-600' },
                        {
                            label: 'Conflitos',
                            value: numConflitos,
                            color: numConflitos > 0 ? 'text-rose-600' : 'text-gray-400'
                        },
                    ].map(({ label, value, color }, i, arr) => (
                        <React.Fragment key={label}>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{label}</span>
                                <span className={`text-xs font-black ${color}`}>
                                    {value}
                                </span>
                            </div>
                            {i < arr.length - 1 && (
                                <span className="text-gray-200 dark:text-slate-600 select-none">|</span>
                            )}
                        </React.Fragment>
                    ))}
                    {isLoading && <span className="text-[10px] font-black text-blue-500 animate-pulse ml-auto uppercase tracking-tighter">Carregando...</span>}
                </div>

                {/* â”€â”€ CONTEUDO â”€â”€
                    position:relative aqui = contexto de posicionamento.
                    O filho usa position:absolute + inset:0 para fugir
                    de QUALQUER overflow-hidden nos ancestrais.
                */}
                {!isLoading && (
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>

                        {/* â”€â”€â”€ ABA GRADE â”€â”€â”€ */}
                        {aba === 'grade' && (
                            salasUnicas.length === 0 ? (
                                <div style={{ position: 'absolute', inset: 0 }} className="flex flex-col items-center justify-center text-gray-400 gap-3">
                                    <span className="text-4xl font-black opacity-20">MAPA</span>
                                    <p className="text-sm font-bold uppercase tracking-widest">Nenhuma aula neste período</p>
                                    <p className="text-[10px] uppercase font-bold text-gray-400">Navegue para outra semana</p>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0, right: 0, bottom: 0, left: 0,
                                        overflow: 'auto',
                                        borderRadius: '12px',
                                        border: '1px solid #e5e7eb',
                                        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)'
                                    }}
                                >
                                    <table
                                        id="rmap-table"
                                        style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%', tableLayout: 'fixed', minWidth: '760px' }}
                                    >
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                                            <tr>
                                                <th
                                                    style={{
                                                        position: 'sticky', left: 0, zIndex: 30,
                                                        background: '#f9fafb', width: '160px', minWidth: '160px',
                                                        borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb',
                                                        padding: '10px 12px', textAlign: 'left',
                                                        fontSize: '10px', fontWeight: 700, color: '#6b7280',
                                                        textTransform: 'uppercase', letterSpacing: '0.05em'
                                                    }}
                                                >
                                                    Sala
                                                </th>
                                                {diasDaSemana.map(dia => {
                                                    const diaStr = format(dia, 'yyyy-MM-dd');
                                                    const isHoje = diaStr === hoje;
                                                    const feriado = feriadosSet.has(diaStr)
                                                        ? (feriados.find(f => f.data === diaStr) || { descricao: 'Feriado', tipo: 'nacional' })
                                                        : null;
                                                    return (
                                                        <th
                                                            key={diaStr}
                                                            style={{
                                                                background: feriado ? '#fff1f2' : isHoje ? '#eff6ff' : '#f9fafb',
                                                                borderBottom: `2px solid ${feriado ? '#fca5a5' : isHoje ? '#93c5fd' : '#e5e7eb'}`,
                                                                borderRight: '1px solid #e5e7eb',
                                                                padding: '8px',
                                                                textAlign: 'center'
                                                            }}
                                                        >
                                                            <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: feriado ? '#ef4444' : isHoje ? '#3b82f6' : '#9ca3af' }}>
                                                                {format(dia, 'EEE', { locale: ptBR })}
                                                            </p>
                                                            <p style={{ fontSize: '14px', fontWeight: 700, color: feriado ? '#dc2626' : isHoje ? '#1d4ed8' : '#374151' }}>
                                                                {format(dia, 'dd/MM')}
                                                            </p>
                                                            {feriado && (
                                                                <p style={{ fontSize: '8px', color: '#ef4444', fontWeight: 600, marginTop: '2px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                                                                    🎉 {feriado.descricao}
                                                                </p>
                                                            )}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {salasUnicas.map(([salaId, salaNome], rowIdx) => (
                                                <tr
                                                    key={salaId}
                                                    style={{ background: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                                                >
                                                    <td
                                                        style={{
                                                            position: 'sticky', left: 0, zIndex: 10,
                                                            background: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb',
                                                            width: '160px', minWidth: '160px',
                                                            borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb',
                                                            padding: '10px 12px', verticalAlign: 'top'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                            <span style={{ fontWeight: 800, fontSize: '12px', color: '#374151', wordBreak: 'break-word', lineHeight: '1.3', textTransform: 'uppercase' }}>
                                                                {salaNome}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {diasDaSemana.map(dia => {
                                                        const diaStr = format(dia, 'yyyy-MM-dd');
                                                        const isHoje = diaStr === hoje;
                                                        const aulasNaCelula = grade[salaId]?.[diaStr] || [];
                                                        return (
                                                            <td
                                                                key={diaStr}
                                                                style={{
                                                                    verticalAlign: 'top',
                                                                    padding: '3px',
                                                                    borderBottom: '1px solid #f1f5f9',
                                                                    borderRight: '1px solid #f1f5f9',
                                                                    background: isHoje ? 'rgba(239,246,255,0.35)' : 'transparent'
                                                                }}
                                                            >
                                                                {aulasNaCelula.length === 0 ? null : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        {consolidarSalaCelula(aulasNaCelula).map(b => {
                                                                            const isConflito = b.conflito;
                                                                            const isCancelada = b.isCancelada;
                                                                            const isProgram = b.isProgram;
                                                                            const cor = isProgram ? '#d97706' : getCourseColor(b.curso);
                                                                            const dim = filtroInstrutor && b.instrutor !== filtroInstrutor;
                                                                            const bg = isConflito ? '#fef2f2' : isCancelada ? '#f1f5f9' : `${cor}18`;
                                                                            const borda = isConflito ? '#ef4444' : isCancelada ? '#cbd5e1' : cor;
                                                                            const label = isProgram ? (b.origem || 'Programa') : b.curso;
                                                                            return (
                                                                                <button
                                                                                    key={b.id}
                                                                                    onClick={() => handleClickAula(b.aula)}
                                                                                    title={`${label}\n${b.instrutor}\n${b.inicio}-${b.fim}${isConflito ? '\n⚠ Conflito de sala' : ''}`}
                                                                                    style={{
                                                                                        width: '100%', textAlign: 'left', borderRadius: '4px',
                                                                                        border: 'none', borderLeft: `3px solid ${borda}`,
                                                                                        padding: '2px 5px', cursor: 'pointer', background: bg,
                                                                                        opacity: isCancelada ? 0.6 : dim ? 0.35 : 1, overflow: 'hidden'
                                                                                    }}
                                                                                >
                                                                                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: isConflito ? '#b91c1c' : '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                                                                                        {isConflito && '⚠ '}{(b.inicio || '').slice(0, 5)}–{(b.fim || '').slice(0, 5)}
                                                                                    </span>
                                                                                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#1e293b', textDecoration: isCancelada ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
                                                                                        {label}
                                                                                    </span>
                                                                                    <span style={{ display: 'block', fontSize: '9px', color: '#64748b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                                                                                        {b.instrutor?.split(' ')[0]}{b.numeroTurma ? ` · #${b.numeroTurma}` : ''}
                                                                                    </span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}


                        {/* ─── ABA DIA ─── */}
                        {aba === 'dia' && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto', padding: '4px' }}>
                                <div className="no-print flex items-center gap-2" style={{ flexShrink: 0 }}>
                                    <button
                                        onClick={() => setDiaSelecionado(p => addDays(p, -1))}
                                        disabled={diaSelecionado <= inicioSemana}
                                        className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors disabled:opacity-30 font-black"
                                    >
                                        &lt;
                                    </button>
                                    <span className="font-bold text-[11px] text-gray-800 dark:text-gray-100 min-w-[200px] text-center uppercase tracking-widest">
                                        {format(diaSelecionado, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                    </span>
                                    <button
                                        onClick={() => setDiaSelecionado(p => addDays(p, 1))}
                                        disabled={diaSelecionado >= fimSemana}
                                        className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors disabled:opacity-30 font-black"
                                    >
                                        &gt;
                                    </button>
                                    <span className="text-xs text-gray-400 ml-2">
                                        {aulasFiltradasDia.length} aula{aulasFiltradasDia.length !== 1 ? 's' : ''}
                                    </span>
                                    {feriadosSet.has(diaSelecionadoStr) && (() => {
                                        const f = feriados.find(x => x.data === diaSelecionadoStr);
                                        return (
                                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full dark:bg-red-900/20 dark:text-red-400 dark:border-red-900">
                                                🎉 {f?.descricao || 'Feriado'}
                                            </span>
                                        );
                                    })()}
                                </div>

                                {aulasFiltradasDia.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3">
                                        <span className="text-4xl font-black opacity-20">SALA</span>
                                        <p className="text-sm font-bold uppercase tracking-widest">Nenhuma aula neste dia</p>
                                        {filtroInstrutor && <p className="text-[10px] uppercase font-bold">Filtrando por: {filtroInstrutor}</p>}
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${Math.min(salasDia.length, 4)}, 1fr)`,
                                        gap: '12px',
                                        overflowY: 'auto',
                                        flex: 1,
                                        minHeight: 0
                                    }}>
                                        {salasDia.map(([salaId, salaNome]) => {
                                            const ac = aulasFiltradasDia.filter(a => a.salaId === salaId);
                                            return (
                                                <div key={salaId} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700/60 border-b border-gray-100 dark:border-slate-700 shrink-0">
                                                        <span className="text-xs font-black text-gray-700 dark:text-gray-200 truncate flex-1 uppercase tracking-wider">{salaNome}</span>
                                                        <span className="text-[10px] font-bold text-gray-400 shrink-0 uppercase tracking-tighter">{ac.length} Aulas</span>
                                                    </div>
                                                    <div className="p-2 flex flex-col gap-2 overflow-y-auto">
                                                        {consolidarSalaCelula(ac).map(b => {
                                                            const isC = b.conflito;
                                                            const isProgram = b.isProgram;
                                                            const aulaCor = isProgram ? '#D97706' : getCourseColor(b.curso);
                                                            const label = isProgram ? (b.origem || 'Programa') : b.curso;
                                                            return (
                                                                <button
                                                                    key={b.id}
                                                                    onClick={() => handleClickAula(b.aula)}
                                                                    className="w-full text-left rounded-lg p-3 transition-all hover:brightness-95 active:scale-[0.99]"
                                                                    style={{
                                                                        background: isC ? '#fef2f2' : `${aulaCor}14`,
                                                                        borderLeft: `4px solid ${isC ? '#f87171' : aulaCor}`
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <span className={`text-[11px] font-black font-mono uppercase tracking-tighter ${isProgram ? 'text-amber-700 dark:text-amber-500' : 'text-gray-700 dark:text-gray-200'}`}>
                                                                             {(b.inicio || '').slice(0, 5)} - {(b.fim || '').slice(0, 5)}
                                                                        </span>
                                                                        {isC && <span className="text-red-600 font-black text-[10px] ml-auto uppercase tracking-widest">! Conflito</span>}
                                                                    </div>
                                                                    <p className={`text-xs font-semibold truncate ${isProgram ? 'text-amber-800 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>{label}</p>
                                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{isProgram ? 'Institucional' : (b.aula.materia || '')}</p>
                                                                    <div className="flex items-center gap-1 mt-1.5">
                                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{b.instrutor}{b.numeroTurma ? ` · #${b.numeroTurma}` : ''}</span>
                                                                    </div>
                                                                    <span className={`mt-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${statusBadge(b.aula.status)}`}>
                                                                        {statusLabel(b.aula.status)}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* â”€â”€â”€ ABA LISTA â”€â”€â”€ */}
                        {aba === 'lista' && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div className="no-print flex flex-wrap gap-2" style={{ flexShrink: 0 }}>
                                    <input
                                        type="text"
                                        placeholder="Buscar por curso, instrutor, sala..."
                                        value={filtroBusca}
                                        onChange={e => setFiltroBusca(e.target.value)}
                                        className="flex-1 min-w-[200px] text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                    />
                                    {salasUnicas.length > 0 && (
                                        <select
                                            value={filtroSala}
                                            onChange={e => setFiltroSala(e.target.value)}
                                            className="text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                        >
                                            <option value="">Todas as salas</option>
                                            {salasUnicas.map(([id, nome]) => (
                                                <option key={id} value={id}>{nome}</option>
                                            ))}
                                        </select>
                                    )}
                                    {(filtroBusca || filtroSala) && (
                                        <button
                                            onClick={() => { setFiltroBusca(''); setFiltroSala(''); }}
                                            className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 dark:border-slate-600 dark:text-gray-400 dark:hover:bg-slate-700 transition"
                                        >
                                            Limpar
                                        </button>
                                    )}
                                </div>

                                {aulasFiltradas.length === 0 ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="text-gray-400 gap-3">
                                        <span className="text-3xl font-black opacity-10 uppercase tracking-tighter">Vazio</span>
                                        <p className="text-sm">Nenhuma aula encontrada</p>
                                    </div>
                                ) : (
                                    <div style={{ flex: 1, overflow: 'auto', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)' }}>
                                        <table className="w-full text-xs border-collapse" style={{ minWidth: '680px' }}>
                                            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-800">
                                                <tr>
                                                    {['Sala', 'Data', 'Horario', 'Curso', 'Materia', 'Instrutor', 'Status'].map(h => (
                                                        <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-slate-700 whitespace-nowrap">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {aulasFiltradas.map((aula, idx) => {
                                                    const isConflito = conflitantes.has(aula.id);
                                                    return (
                                                        <tr
                                                            key={aula.id}
                                                            onClick={() => handleClickAula(aula)}
                                                            className={`border-b border-gray-100 dark:border-slate-700/50 cursor-pointer hover:bg-blue-50/40 dark:hover:bg-slate-700/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/40 dark:bg-slate-800/40'} ${isConflito ? '!bg-red-50/60 dark:!bg-red-900/10' : ''}`}
                                                        >
                                                            <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                                                                <div className="flex items-center gap-1">
                                                                    {isConflito && <span className="text-red-500 font-black text-[10px]">!</span>}
                                                                    <span className="inline-block w-1.5 h-3.5 rounded-full mr-1 flex-shrink-0" style={{ backgroundColor: aula.cor }} />
                                                                    {aula.sala}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                                {format(parseISO(aula.data + 'T00:00:00'), 'EEE dd/MM', { locale: ptBR })}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono text-[11px]">
                                                                {aula.horarioInicio}-{aula.horarioFim}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200 max-w-[160px] truncate">{aula.curso}</td>
                                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[130px] truncate">{aula.materia}</td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{aula.instrutor}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(aula.status)}`}>
                                                                    {statusLabel(aula.status)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex items-center gap-3">
                                            <span>{aulasFiltradas.length} aula{aulasFiltradas.length !== 1 ? 's' : ''} encontrada{aulasFiltradas.length !== 1 ? 's' : ''}</span>
                                            {numConflitos > 0 && (
                                                <span className="text-red-500 flex items-center gap-1">
                                                    <span className="font-black text-[10px]">!</span>
                                                    {numConflitos} conflito{numConflitos !== 1 ? 's' : ''} detectado{numConflitos !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </div>
        </>
    );
};
