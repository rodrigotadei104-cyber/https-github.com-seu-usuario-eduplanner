'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, Printer, LayoutGrid, List, AlertTriangle, Clock, Building2, BookOpen, Loader2, Info, CalendarDays, User } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSchedule } from '../context/ScheduleContext';
import { AulaMapaSala } from '../services/aula.service';
import { Aula } from '../types';
import * as XLSX from 'xlsx';

// ============================================
// HELPERS
// ============================================

const toMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

const calcDurationHours = (aula: AulaMapaSala): number => {
    const mins = toMinutes(aula.horarioFim) - toMinutes(aula.horarioInicio);
    return mins > 0 ? Math.round((mins / (aula.minutosPorHora || 60)) * 100) / 100 : 0;
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
    const { aulas: aulasGlobais, isLoading, feriadosSet, feriados } = useSchedule();
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

        return (aulasGlobais as Aula[])
            .filter(a => {
                const dataAulaStr = a.data instanceof Date
                    ? format(a.data, 'yyyy-MM-dd')
                    : String(a.data);
                return dataAulaStr >= diaInicioStr && dataAulaStr <= diaFimStr;
            })
            .map(a => ({
                id: a.id,
                data: a.data instanceof Date ? format(a.data, 'yyyy-MM-dd') : String(a.data),
                horarioInicio: a.horarioInicio,
                horarioFim: a.horarioFim,
                salaId: a.sala || 'sem-sala',
                sala: a.sala || 'Sem sala definida',
                curso: a.curso,
                materia: a.materia,
                instrutor: a.instrutor,
                cor: a.cor,
                status: a.status,
                minutosPorHora: a.minutosPorHora
            }));
    }, [aulasGlobais, inicioSemana, fimSemana]);

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

        // â”€â”€ Aba 1: Grade Semanal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const gradeRows: (string | number)[][] = [
            [`MAPA DE SALAS  |  ${labelS}  |  ${aulasAtivas.length} aulas  |  ${totalHoras.toFixed(1)}h  |  Gerado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
            [],
            ['SALA', ...diasHeader.map(d => d.toUpperCase())],
            ...salasUnicas.map(([salaId, salaNome]) => [
                salaNome,
                ...diasDaSemana.map(dia => {
                    const ac = grade[salaId]?.[format(dia, 'yyyy-MM-dd')] || [];
                    if (ac.length === 0) return '';
                    return ac.map(a =>
                        `${a.horarioInicio}-${a.horarioFim}  ${a.curso}\n[${a.instrutor}]`
                    ).join('\n---\n');
                })
            ]),
            [],
            [numConflitos > 0 ? `âš  ${numConflitos} CONFLITO(S) DETECTADO(S) NESTA SEMANA` : 'Sem conflitos']
        ];

        const wsGrade = XLSX.utils.aoa_to_sheet(gradeRows);
        wsGrade['!cols'] = [{ wch: 26 }, ...diasHeader.map(() => ({ wch: 36 }))];
        wsGrade['!rows'] = [
            { hpt: 24 }, { hpt: 5 }, { hpt: 18 },
            ...salasUnicas.map(() => ({ hpt: 64 })),
            { hpt: 5 }, { hpt: 14 }
        ];
        (wsGrade as any)['!freeze'] = { xSplit: 1, ySplit: 3 };
        wsGrade['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 + diasHeader.length - 1 } }];
        XLSX.utils.book_append_sheet(wb, wsGrade, 'Grade Semanal');

        // â”€â”€ Aba 2: Lista Detalhada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const detalhadoRows: (string | number)[][] = [
            [`LISTA DETALHADA  |  ${labelS}`],
            [],
            ['SALA', 'DATA', 'INICIO', 'FIM', 'DURACAO (h)', 'CURSO', 'MATERIA', 'INSTRUTOR', 'STATUS', 'CONFLITO'],
            ...aulasFiltradas.map(a => [
                a.sala,
                format(parseISO(a.data + 'T00:00:00'), 'EEE dd/MM/yyyy', { locale: ptBR }),
                a.horarioInicio,
                a.horarioFim,
                calcDurationHours(a),
                a.curso,
                a.materia,
                a.instrutor,
                statusLabel(a.status),
                conflitantes.has(a.id) ? 'SIM' : '-'
            ])
        ];

        const wsDetalhado = XLSX.utils.aoa_to_sheet(detalhadoRows);
        wsDetalhado['!cols'] = [
            { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 11 },
            { wch: 34 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 9 }
        ];
        wsDetalhado['!rows'] = [{ hpt: 24 }, { hpt: 5 }, { hpt: 18 }];
        (wsDetalhado as any)['!freeze'] = { xSplit: 1, ySplit: 3 };
        wsDetalhado['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
        XLSX.utils.book_append_sheet(wb, wsDetalhado, 'Lista Detalhada');

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
                    : ac.map(a => {
                        const isC = conflitantes.has(a.id);
                        return `<div style="background:${isC ? '#fef2f2' : `${a.cor}18`};border-left:3px solid ${isC ? '#f87171' : a.cor};border-radius:4px;padding:3px 6px;margin-bottom:3px">
                            <div style="font-size:8.5px;font-weight:700;color:${isC ? '#b91c1c' : '#0f172a'}">${a.horarioInicio}-${a.horarioFim}${isC ? ' âš ' : ''}</div>
                            <div style="font-size:9.5px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:125px">${a.curso}</div>
                            <div style="font-size:8px;color:#94a3b8">${a.instrutor.split(' ')[0]}</div>
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
    <button class="btn" onclick="window.print()">ðŸ–¨ Imprimir / Salvar PDF</button>
    <button class="btn sec" onclick="window.close()">âœ• Fechar</button>
  </div>
  <div class="card">
    <div class="hdr">
      <div>
        <div class="title">ðŸ“… Mapa de Salas</div>
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
                    height: '100%',
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
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm min-w-[162px] text-center">
                            {labelSemana}
                        </span>
                        <button
                            onClick={() => setSemanaBase(p => addWeeks(p, 1))}
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <ChevronRight size={16} />
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
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
                                        ${aba === t
                                            ? 'bg-white shadow text-gray-800 dark:bg-slate-600 dark:text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                        }`}
                                >
                                    {t === 'grade' ? <LayoutGrid size={13} /> : t === 'lista' ? <List size={13} /> : <CalendarDays size={13} />}
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
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                        >
                            <Download size={13} /> Excel
                        </button>
                        <button
                            onClick={exportarPDF}
                            disabled={isLoading || aulas.length === 0}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition disabled:opacity-40 disabled:cursor-not-allowed dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                        >
                            <Printer size={13} /> PDF
                        </button>
                    </div>
                </div>

                {/* â”€â”€ INDICADORES â”€â”€ */}
                <div className="no-print flex items-center gap-4 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex-wrap" style={{ flexShrink: 0 }}>
                    {[
                        { Icon: BookOpen, label: 'Aulas', value: aulasAtivas.length, color: 'text-blue-500' },
                        { Icon: Clock, label: 'Horas', value: `${totalHoras.toFixed(1)}h`, color: 'text-indigo-500' },
                        { Icon: Building2, label: 'Salas', value: salasUnicas.length, color: 'text-teal-500' },
                        {
                            Icon: AlertTriangle,
                            label: 'Conflitos',
                            value: numConflitos,
                            color: numConflitos > 0 ? 'text-rose-500' : 'text-gray-300 dark:text-slate-600'
                        },
                    ].map(({ Icon, label, value, color }, i, arr) => (
                        <React.Fragment key={label}>
                            <div className="flex items-center gap-2">
                                <Icon size={15} className={color} />
                                <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                                <span className={`text-sm font-bold ${numConflitos > 0 && label === 'Conflitos' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-100'}`}>
                                    {value}
                                </span>
                            </div>
                            {i < arr.length - 1 && (
                                <span className="text-gray-200 dark:text-slate-600 select-none">|</span>
                            )}
                        </React.Fragment>
                    ))}
                    {isLoading && <Loader2 size={14} className="animate-spin text-blue-400 ml-auto" />}
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
                                    <LayoutGrid size={40} strokeWidth={1} />
                                    <p className="text-sm font-medium">Nenhuma aula neste periodo</p>
                                    <p className="text-xs">Navegue para outra semana</p>
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
                                        style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '1100px' }}
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
                                                                width: '134px', minWidth: '134px',
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
                                                            <Building2 size={12} style={{ color: '#9ca3af', flexShrink: 0, marginTop: '2px' }} />
                                                            <span style={{ fontWeight: 600, fontSize: '12px', color: '#374151', wordBreak: 'break-word', lineHeight: '1.3' }}>
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
                                                                    padding: '6px',
                                                                    minHeight: '60px',
                                                                    borderBottom: '1px solid #e5e7eb',
                                                                    borderRight: '1px solid #e5e7eb',
                                                                    background: isHoje ? 'rgba(239,246,255,0.3)' : 'transparent',
                                                                    width: '134px', minWidth: '134px'
                                                                }}
                                                            >
                                                                {aulasNaCelula.length === 0 ? (
                                                                    <span style={{ color: '#e5e7eb', fontSize: '10px', display: 'block', paddingTop: '4px', paddingLeft: '4px', userSelect: 'none' }}>-</span>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        {aulasNaCelula.map(aula => {
                                                                            const isConflito = conflitantes.has(aula.id);
                                                                            const isCancelada = aula.status === 'cancelada';
                                                                            return (
                                                                                <button
                                                                                    key={aula.id}
                                                                                    onClick={() => handleClickAula(aula)}
                                                                                    title={`${aula.curso}\n${aula.instrutor}\n${aula.horarioInicio}-${aula.horarioFim}`}
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        textAlign: 'left',
                                                                                        borderRadius: '6px',
                                                                                        overflow: 'hidden',
                                                                                        cursor: 'pointer',
                                                                                        border: 'none',
                                                                                        padding: 0,
                                                                                        opacity: isCancelada ? 0.5 : (filtroInstrutor && aula.instrutor !== filtroInstrutor ? 0.3 : 1),
                                                                                        outline: isConflito ? '1px solid #f87171' : 'none',
                                                                                        backgroundColor: isConflito ? '#fef2f2' : isCancelada ? '#f9fafb' : `${aula.cor}11`,
                                                                                        borderLeft: `3px solid ${isConflito ? '#f87171' : isCancelada ? '#d1d5db' : aula.cor}`
                                                                                    }}
                                                                                >
                                                                                    <div style={{ padding: '4px 6px' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                                                                            {isConflito && <AlertTriangle size={9} style={{ color: '#ef4444', flexShrink: 0 }} />}
                                                                                            <span style={{
                                                                                                fontSize: '10px', fontWeight: 700,
                                                                                                color: isConflito ? '#b91c1c' : isCancelada ? '#9ca3af' : '#374151',
                                                                                                fontVariantNumeric: 'tabular-nums',
                                                                                                lineHeight: 1
                                                                                            }}>
                                                                                                {aula.horarioInicio}-{aula.horarioFim}
                                                                                            </span>
                                                                                        </div>
                                                                                        <span style={{
                                                                                            display: 'block', fontSize: '11px', fontWeight: 500,
                                                                                            color: isCancelada ? '#9ca3af' : '#111827',
                                                                                            textDecoration: isCancelada ? 'line-through' : 'none',
                                                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                                            lineHeight: 1.3
                                                                                        }}>
                                                                                            {aula.curso}
                                                                                        </span>
                                                                                        <span style={{
                                                                                            display: 'block', fontSize: '10px',
                                                                                            color: '#9ca3af',
                                                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                                            lineHeight: 1.3
                                                                                        }}>
                                                                                            {aula.instrutor.split(' ')[0]}
                                                                                        </span>
                                                                                    </div>
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
                                        className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors disabled:opacity-30"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 min-w-[200px] text-center capitalize">
                                        {format(diaSelecionado, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                                    </span>
                                    <button
                                        onClick={() => setDiaSelecionado(p => addDays(p, 1))}
                                        disabled={diaSelecionado >= fimSemana}
                                        className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 transition-colors disabled:opacity-30"
                                    >
                                        <ChevronRight size={16} />
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
                                        <CalendarDays size={40} strokeWidth={1} />
                                        <p className="text-sm font-medium">Nenhuma aula neste dia</p>
                                        {filtroInstrutor && <p className="text-xs">Filtrando por: {filtroInstrutor}</p>}
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
                                                        <Building2 size={13} className="text-gray-400 shrink-0" />
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate flex-1">{salaNome}</span>
                                                        <span className="text-[10px] text-gray-400 shrink-0">{ac.length} aula{ac.length !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="p-2 flex flex-col gap-2 overflow-y-auto">
                                                        {ac.map(aula => {
                                                            const isC = conflitantes.has(aula.id);
                                                            return (
                                                                <button
                                                                    key={aula.id}
                                                                    onClick={() => handleClickAula(aula)}
                                                                    className="w-full text-left rounded-lg p-3 transition-all hover:brightness-95 active:scale-[0.99]"
                                                                    style={{
                                                                        background: isC ? '#fef2f2' : `${aula.cor}14`,
                                                                        borderLeft: `4px solid ${isC ? '#f87171' : aula.cor}`
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <Clock size={10} className="text-gray-400" />
                                                                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 font-mono">
                                                                            {aula.horarioInicio} - {aula.horarioFim}
                                                                        </span>
                                                                        {isC && <AlertTriangle size={10} className="text-red-500 ml-auto" />}
                                                                    </div>
                                                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{aula.curso}</p>
                                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{aula.materia}</p>
                                                                    <div className="flex items-center gap-1 mt-1.5">
                                                                        <User size={9} className="text-gray-400" />
                                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{aula.instrutor}</span>
                                                                    </div>
                                                                    <span className={`mt-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${statusBadge(aula.status)}`}>
                                                                        {statusLabel(aula.status)}
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
                                        <Info size={36} strokeWidth={1} />
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
                                                                    {isConflito && <AlertTriangle size={11} className="text-red-500 flex-shrink-0" />}
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
                                                    <AlertTriangle size={11} />
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
