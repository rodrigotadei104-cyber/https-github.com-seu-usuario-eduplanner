import { Aula, Instrutor, Curso, Materia } from './types';
import { addDays, setHours, setMinutes, subDays, startOfMonth } from 'date-fns';

const today = new Date();
const DEMO_TENANT_ID = 'demo-tenant-1';

export const COLORS = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  purple: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316',
  teal: '#14b8a6',
};

// Lista fixa de salas (padroniza o cadastro e evita duplicidade tipo "Sala 1" vs "Sala 01").
// "Outro" NÃO entra aqui — é tratado no componente SalaSelect como campo de texto livre.
export const SALAS_DISPONIVEIS: string[] = [
  'Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5', 'Sala 7', 'Sala 8',
  'Estacionamento 1', 'Estacionamento 2', 'Auditório', 'Área Externa', 'Fora da Unidade',
];

export const MOCK_INSTRUTORES: Instrutor[] = [
  { id: '1', tenantId: DEMO_TENANT_ID, nome: 'Prof. Carlos Silva', email: 'carlos.silva@escola.com', telefone: '(11) 99999-1234' },
  { id: '2', tenantId: DEMO_TENANT_ID, nome: 'Dra. Ana Costa', email: 'ana.costa@escola.com', telefone: '(11) 98888-5678' },
  { id: '3', tenantId: DEMO_TENANT_ID, nome: 'Prof. Roberto Santos', email: 'roberto.santos@escola.com', telefone: '(21) 97777-4321' },
  { id: '4', tenantId: DEMO_TENANT_ID, nome: 'Prof. Fernanda Lima', email: 'fernanda.lima@escola.com', telefone: '(31) 96666-8765' },
  { id: '5', tenantId: DEMO_TENANT_ID, nome: 'Prof. Genérico', email: 'generico@escola.com', telefone: '(41) 95555-0000' },
];

export const MOCK_CURSOS: Curso[] = [
  { id: '1', tenantId: DEMO_TENANT_ID, nome: 'Engenharia de Software', cor: COLORS.blue, cargaHoraria: '3600h', status: 'ativo' },
  { id: '2', tenantId: DEMO_TENANT_ID, nome: 'Design Digital', cor: COLORS.purple, cargaHoraria: '2800h', status: 'ativo' },
  { id: '3', tenantId: DEMO_TENANT_ID, nome: 'Administração', cor: COLORS.orange, cargaHoraria: '3000h', status: 'ativo' },
  { id: '4', tenantId: DEMO_TENANT_ID, nome: 'Direito', cor: COLORS.teal, cargaHoraria: '3700h', status: 'ativo' },
  { id: '5', tenantId: DEMO_TENANT_ID, nome: 'Curso Extra', cor: COLORS.indigo, cargaHoraria: '120h', status: 'ativo' },
];

export const MOCK_MATERIAS: Materia[] = [
  { id: '1', tenantId: DEMO_TENANT_ID, nome: 'Algoritmos Avançados', cursoId: '1', cargaHoraria: 80 },
  { id: '2', tenantId: DEMO_TENANT_ID, nome: 'Estrutura de Dados', cursoId: '1', cargaHoraria: 80 },
  { id: '3', tenantId: DEMO_TENANT_ID, nome: 'UX/UI Fundamentals', cursoId: '2', cargaHoraria: 60 },
  { id: '4', tenantId: DEMO_TENANT_ID, nome: 'Prototipagem', cursoId: '2', cargaHoraria: 40 },
  { id: '5', tenantId: DEMO_TENANT_ID, nome: 'Gestão de Projetos', cursoId: '3', cargaHoraria: 60 },
  { id: '6', tenantId: DEMO_TENANT_ID, nome: 'Workshop de Liderança', cursoId: '3', cargaHoraria: 20 },
  { id: '7', tenantId: DEMO_TENANT_ID, nome: 'Direito Constitucional', cursoId: '4', cargaHoraria: 100 },
  { id: '8', tenantId: DEMO_TENANT_ID, nome: 'Aula Prática', cursoId: '5', cargaHoraria: 10 },
];

export const MOCK_AULAS: Aula[] = [
  {
    id: '1',
    tenantId: DEMO_TENANT_ID,
    data: today,
    horarioInicio: '08:00',
    horarioFim: '10:00',
    instrutor: 'Prof. Carlos Silva',
    curso: 'Engenharia de Software',
    materia: 'Algoritmos Avançados',
    sala: 'Lab 03',
    status: 'em-andamento',
    cor: COLORS.blue,
    observacoes: 'Prova parcial',
  },
  {
    id: '2',
    tenantId: DEMO_TENANT_ID,
    data: today,
    horarioInicio: '10:30',
    horarioFim: '12:30',
    instrutor: 'Dra. Ana Costa',
    curso: 'Design Digital',
    materia: 'UX/UI Fundamentals',
    sala: 'Sala 101',
    status: 'agendada',
    cor: COLORS.purple,
  },
  {
    id: '3',
    tenantId: DEMO_TENANT_ID,
    data: today,
    horarioInicio: '14:00',
    horarioFim: '16:00',
    instrutor: 'Prof. Roberto Santos',
    curso: 'Administração',
    materia: 'Gestão de Projetos',
    sala: 'Auditório B',
    status: 'agendada',
    cor: COLORS.orange,
  },
  {
    id: '4',
    tenantId: DEMO_TENANT_ID,
    data: addDays(today, 1),
    horarioInicio: '09:00',
    horarioFim: '11:00',
    instrutor: 'Prof. Carlos Silva',
    curso: 'Engenharia de Software',
    materia: 'Estrutura de Dados',
    sala: 'Lab 02',
    status: 'agendada',
    cor: COLORS.blue,
  },
  {
    id: '5',
    tenantId: DEMO_TENANT_ID,
    data: subDays(today, 1),
    horarioInicio: '08:00',
    horarioFim: '10:00',
    instrutor: 'Prof. Fernanda Lima',
    curso: 'Direito',
    materia: 'Direito Constitucional',
    sala: 'Sala 204',
    status: 'concluida',
    cor: COLORS.teal,
  },
  {
    id: '6',
    tenantId: DEMO_TENANT_ID,
    data: addDays(today, 2),
    horarioInicio: '19:00',
    horarioFim: '21:00',
    instrutor: 'Dra. Ana Costa',
    curso: 'Design Digital',
    materia: 'Prototipagem',
    sala: 'Lab Mac',
    status: 'cancelada',
    cor: COLORS.purple,
    observacoes: 'Instrutora doente',
  },
  {
    id: '7',
    tenantId: DEMO_TENANT_ID,
    data: startOfMonth(today),
    horarioInicio: '08:00',
    horarioFim: '12:00',
    instrutor: 'Prof. Roberto Santos',
    curso: 'Administração',
    materia: 'Workshop de Liderança',
    sala: 'Auditório Principal',
    status: 'concluida',
    cor: COLORS.orange,
  }
];

// Generate more data for annual view visualization
for (let i = 1; i < 50; i++) {
  const randomDay = Math.floor(Math.random() * 60) - 30; // +/- 30 days
  const date = addDays(today, randomDay);
  MOCK_AULAS.push({
    id: `auto-${i}`,
    tenantId: DEMO_TENANT_ID,
    data: date,
    horarioInicio: '14:00',
    horarioFim: '16:00',
    instrutor: 'Prof. Genérico',
    curso: 'Curso Extra',
    materia: 'Aula Prática',
    sala: 'Sala B',
    status: i % 5 === 0 ? 'cancelada' : 'agendada',
    cor: COLORS.indigo
  });
}