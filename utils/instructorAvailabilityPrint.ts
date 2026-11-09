import type {PlanningTurnDay} from './instructorTurns';

interface AvailabilityReport {
    instructor: string;
    from: string;
    to: string;
    loadedAt: string;
    source: string;
    intervalException: boolean;
    days: PlanningTurnDay[];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');

/** Only real calendar availability belongs here; draft reservations are excluded by the caller. */
export function buildInstructorAvailabilityReport(report: AvailabilityReport): string {
    const days = report.days.filter(day => !day.bloqueios.length && day.turnos.some(turn => turn.status === 'disponivel'))
        .slice().sort((a, b) => a.data.localeCompare(b.data));
    const rows = days.map(day => {
        const weekday = new Date(`${day.data}T12:00:00`).toLocaleDateString('pt-BR', {weekday: 'long'});
        const turns = day.turnos.filter(turn => turn.status === 'disponivel').slice()
            .sort((a, b) => a.inicio.localeCompare(b.inicio));
        return `<tr><td>${escapeHtml(dateLabel(day.data))}</td><td>${escapeHtml(weekday)}</td><td>${turns.map(turn => `${escapeHtml(turn.nome)}: ${escapeHtml(turn.inicio)}–${escapeHtml(turn.fim)}`).join('<br>')}</td></tr>`;
    }).join('\n');
    const turnCount = days.reduce((count, day) => count + day.turnos.filter(turn => turn.status === 'disponivel').length, 0);
    const snapshot = new Date(report.loadedAt).toLocaleString('pt-BR');
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Datas livres — ${escapeHtml(report.instructor)}</title>
<style>
@page {size: A4 portrait; margin: 16mm;}
* {box-sizing: border-box;} body {max-width: 960px; margin: 28px auto; padding: 0 20px; font: 14px/1.5 Arial, sans-serif; color: #172033; background: white;}
h1 {font-size: 24px; margin: 0 0 14px;} p {margin: 6px 0;} .brand {font-weight: bold; color: #0f766e;} .note {font-size: 12px; color: #475569;}
table {width: 100%; border-collapse: collapse; margin: 18px 0;} th, td {padding: 10px; border: 1px solid #b8c3ce; text-align: left; vertical-align: top;} th {background: #eef4f4;} thead {display: table-header-group;} tr {break-inside: avoid;}
button {padding: 10px 16px; margin-bottom: 20px; border: 0; border-radius: 6px; background: #0f766e; color: white; font-weight: bold; cursor: pointer;}
@media print {body {max-width: none; margin: 0; padding: 0; font-size: 11pt;} button {display: none;} h1 {font-size: 18pt;} }
</style></head><body>
<button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
<p class="brand">EduPlanner</p><h1>Datas e turnos livres do instrutor</h1>
<p><strong>Instrutor:</strong> ${escapeHtml(report.instructor)}</p>
<p><strong>Período:</strong> ${escapeHtml(dateLabel(report.from))} a ${escapeHtml(dateLabel(report.to))}</p>
<p><strong>Horários considerados:</strong> ${escapeHtml(report.source)}</p>
<p><strong>Agenda consultada em:</strong> ${escapeHtml(snapshot)}</p>
<p><strong>Disponibilidade:</strong> ${days.length} ${days.length === 1 ? 'dia' : 'dias'} · ${turnCount} ${turnCount === 1 ? 'turno inteiro' : 'turnos inteiros'}</p>
${report.intervalException ? '<p><strong>Exceção selecionada:</strong> os intervalos cadastrados foram desconsiderados nesta consulta. Combine os horários com o instrutor.</p>' : ''}
${rows ? `<table><thead><tr><th>Data</th><th>Dia da semana</th><th>Turnos livres</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>Nenhum turno inteiro livre nas condições escolhidas.</p>'}
<p class="note">Disponibilidade conforme a agenda consultada e os horários considerados. O rascunho da simulação não reserva a agenda e não retira turnos deste relatório. Aulas, eventos e dias bloqueados foram considerados. Confirme a disponibilidade antes de agendar; a disponibilidade de salas não faz parte deste relatório.</p>
</body></html>`;
}
