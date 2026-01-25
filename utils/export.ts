import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const exportAulasToCSV = (aulas: any[], fileName: string) => {
    // 1. Cabeçalho
    const headers = [
        'ID',
        'Número', // New
        'Curso',
        'Matéria', // New/Fixed
        'Instrutor',
        'Sala',
        'Data',
        'Início',
        'Fim',
        'Status',
        'Criado em'
    ];

    // 2. Processar linhas
    const rows = aulas.map(aula => {
        // Safe access to nested relations if they exist, or flat props
        const cursoNome = aula.curso?.nome || aula.curso || '';
        const numeroCurso = aula.curso?.numero_curso || aula.numeroCurso || ''; // Get number
        const instrutorNome = aula.instrutor?.nome || aula.instrutor || '';
        const materiaNome = aula.materia?.nome || aula.materia || '';

        // Formatar datas
        const dataFormatada = aula.data ? format(new Date(aula.data + 'T00:00:00'), 'dd/MM/yyyy') : '';
        const criadoEm = aula.created_at ? format(new Date(aula.created_at), 'dd/MM/yyyy HH:mm') : '';

        return [
            aula.id,
            `"${numeroCurso}"`,
            `"${cursoNome}"`,
            `"${materiaNome}"`,
            `"${instrutorNome}"`,
            aula.sala || '',
            dataFormatada,
            aula.horario_inicio,
            aula.horario_fim,
            statusLabel(aula.status),
            criadoEm
        ].join(',');
    });

    // 3. Montar conteúdo CSV com BOM para Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

    // 4. Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const statusLabel = (status: string) => {
    switch (status) {
        case 'agendada': return 'Agendada';
        case 'em_andamento': return 'Em Andamento';
        case 'concluida': return 'Concluída';
        case 'cancelada': return 'Cancelada';
        default: return status;
    }
};
