
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parseISO, differenceInMinutes, isBefore, isAfter, startOfDay } from 'date-fns';

const url = 'https://ubhtibihkpwocgazwtur.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaHRpYmloa3B3b2NnYXp3dHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDYzMjgsImV4cCI6MjA4MzE4MjMyOH0.ir01eaNOa9B2-uaAl91yZ6eQLPmb8Ub2c8d4g3NTaRg';

const supabase = createClient(url, key);

async function runAudit() {
    console.log('Iniciando Auditoria de Integridade...');

    // 1. Fetch Data
    const { data: aulas, error: errAulas } = await supabase.from('aulas').select('*');
    const { data: instrutores, error: errInst } = await supabase.from('instrutores').select('id');
    const { data: materias, error: errMat } = await supabase.from('materias').select('id');

    if (errAulas || errInst || errMat) {
        console.error('Erro ao buscar dados:', errAulas, errInst, errMat);
        return;
    }

    const instrutorIds = new Set(instrutores.map(i => i.id));
    const materiaIds = new Set(materias.map(m => m.id));
    const today = startOfDay(new Date());

    const issues = [];
    const duplicatesMap = {}; // Key: date_start_instructor

    console.log(`Analisando ${aulas.length} aulas...`);

    aulas.forEach(aula => {
        const issuesFound = [];
        const aulaDate = parseISO(aula.data);
        const [hStart, mStart] = aula.horario_inicio.split(':').map(Number);
        const [hEnd, mEnd] = aula.horario_fim.split(':').map(Number);
        const duration = (hEnd * 60 + mEnd) - (hStart * 60 + mStart);

        // 1. Sem Instrutor
        if (!aula.instrutor_id) {
            issues.push({ date: aula.data, id: aula.id, type: 'SEM_INSTRUTOR', severity: 'CRITICA', details: 'Instrutor ID nulo' });
        } else if (!instrutorIds.has(aula.instrutor_id)) {
            issues.push({ date: aula.data, id: aula.id, type: 'ORFAO_INSTRUTOR', severity: 'CRITICA', details: `Instrutor ${aula.instrutor_id} não existe` });
        }

        // 2. Sem Matéria
        if (!aula.materia_id) {
            issues.push({ date: aula.data, id: aula.id, type: 'SEM_MATERIA', severity: 'CRITICA', details: 'Matéria ID nulo' });
        } else if (!materiaIds.has(aula.materia_id)) {
            issues.push({ date: aula.data, id: aula.id, type: 'ORFAO_MATERIA', severity: 'CRITICA', details: `Matéria ${aula.materia_id} não existe` });
        }

        // 3. Concluída Incompleta
        if (aula.status === 'concluida' && (!aula.instrutor_id || !aula.materia_id)) {
            issues.push({ date: aula.data, id: aula.id, type: 'CONCLUIDA_INCOMPLETA', severity: 'ALTA', details: 'Concluída sem instrutor/matéria' });
        }

        // 4. Duração Curta
        if (duration < 30) {
            issues.push({ date: aula.data, id: aula.id, type: 'DURACAO_CURTA', severity: 'MEDIA', details: `Duração de ${duration} minutos` });
        }

        // 5. Futuro Concluído
        if (isAfter(aulaDate, today) && aula.status === 'concluida') {
            issues.push({ date: aula.data, id: aula.id, type: 'FUTURO_CONCLUIDO', severity: 'ALTA', details: `Data futura (${aula.data}) mas concluída` });
        }

        // 6. Passado Pendente (Agendada)
        if (isBefore(aulaDate, today) && aula.status === 'agendada') {
            issues.push({ date: aula.data, id: aula.id, type: 'PASSADO_PENDENTE', severity: 'BAIXA', details: `Data passada (${aula.data}) ainda agendada` });
        }

        // 7. Duplicidade (Check)
        // Key: Data + Instrutor + HorarioInicio
        if (aula.instrutor_id) {
            const key = `${aula.data}_${aula.instrutor_id}_${aula.horario_inicio}`;
            if (!duplicatesMap[key]) duplicatesMap[key] = [];
            duplicatesMap[key].push(aula.id);
        }
    });

    // Process Duplicates
    Object.entries(duplicatesMap).forEach(([key, ids]) => {
        if (ids.length > 1) {
            const dateStr = key.split('_')[0];
            ids.forEach(id => {
                issues.push({ date: dateStr, id, type: 'DUPLICIDADE', severity: 'ALTA', details: `Colisão de horário com instrutor (Grupo: ${key})` });
            });
        }
    });

    // Generate Report
    const reportPath = 'AUDIT_REPORT.md';
    const groupedIssues = {};

    issues.forEach(i => {
        if (!groupedIssues[i.type]) groupedIssues[i.type] = [];
        groupedIssues[i.type].push(i);
    });

    let content = `# Relatório de Auditoria de Integridade (Aulas)\nGenerated: ${new Date().toISOString()}\n\n`;
    content += `Total de Aulas Analisadas: ${aulas.length}\n`;
    content += `Total de Problemas Encontrados: ${issues.length}\n\n`;

    content += `| Tipo de Problema | Gravidade | Ocorrências |\n|---|---|---|\n`;
    Object.keys(groupedIssues).forEach(type => {
        const count = groupedIssues[type].length;
        const severity = groupedIssues[type][0].severity;
        content += `| ${type} | ${severity} | ${count} |\n`;
    });

    content += `\n## Detalhes por Tipo\n`;

    Object.keys(groupedIssues).forEach(type => {
        content += `\n### ${type} (${groupedIssues[type].length})\n`;
        content += `| ID Aula | Data | Detalhes |\n|---|---|---|\n`;
        groupedIssues[type].slice(0, 50).forEach(issue => {
            // We need to find the date from the original 'aulas' array or pass it in issue object
            // Let's store date in issue object first
            content += `| \`${issue.id}\` | ${issue.date} | ${issue.details} |\n`;
        });
        if (groupedIssues[type].length > 50) content += `| ... | ... | ... mais ${groupedIssues[type].length - 50} itens |\n`;
    });

    fs.writeFileSync(reportPath, content);
    console.log(`Relatório salvo em ${reportPath}`);
}

runAudit();
