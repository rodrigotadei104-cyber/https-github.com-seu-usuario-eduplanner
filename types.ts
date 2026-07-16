export type ClassStatus = 'agendada' | 'em-andamento' | 'concluida' | 'cancelada';
export type TipoAula = 'NORMAL' | 'PROGRAMA';
export type OrigemPrograma = 'JOVEM_APRENDIZ' | string;

export type DisciplinaTipo = 'teorica' | 'pratica' | 'hibrida' | 'outros';
export type TurmaStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';
export type FeriadoTipo = 'nacional' | 'estadual' | 'municipal' | 'institucional';
export type BloqueioTipo = 'institucional' | 'sala' | 'instrutor' | 'curso';

export interface CatalogoCurso {
  id: string;
  tenantId: string;
  nomeCurso: string;
  cargaTotalHoras: number;
  tipoHoraMin?: string;
  ativo: boolean;
  createdAt?: string;
}

export interface DisciplinaCurso {
  id: string;
  tenantId: string;
  cursoId: string;
  nomeDisciplina: string;
  cargaHoras: number;
  tipoDisciplina: DisciplinaTipo;
  ordem?: number;
  createdAt?: string;
}

export interface HorarioSlot {
  inicio: string;
  fim: string;
}

export interface Turma {
  id: string;
  tenantId: string;
  numeroTurma: string;
  cursoId: string;
  instrutorId?: string;
  salaPadrao?: string;
  dataInicio: string; // Formato YYYY-MM-DD
  diasSemanaSelecionados: number[]; // 0 = Dom, 1 = Seg, ..., 6 = Sab
  horariosDoDia: HorarioSlot[];
  status: TurmaStatus;
  datasBloqueadas?: string[];
  createdAt?: string;
}

export interface Feriado {
  id: string;
  tenantId: string;
  data: string; // Formato YYYY-MM-DD
  descricao: string;
  tipo: FeriadoTipo;
  ativo: boolean;
}

export interface DataBloqueada {
  id: string;
  tenantId: string;
  data: string; // Formato YYYY-MM-DD
  motivo: string;
  tipo: BloqueioTipo;
  criadoPor?: string;
  ativo: boolean;
}


export interface Aula {
  id: string;
  tenantId: string; // Multi-tenant isolation
  data: Date;
  horarioInicio: string; // "08:00"
  horarioFim: string;    // "10:00"
  instrutor: string;
  curso: string;
  cursoId?: string; // ID do curso para buscar progresso
  materia: string;
  materiaId?: string; // ID da matéria para buscar progresso
  sala?: string;
  status: ClassStatus;
  cor?: string; // Hex para identificação visual
  observacoes?: string;
  minutosPorHora?: number; // Para cálculo de carga horária (50 ou 60)
  numeroCurso?: string; // Para exibição no calendário
  numeroTurma?: string; // Para identificar turmas diferentes (cohorts)
  cargaHorariaMateria?: number; // Carga horária da matéria (em horas/aula)
  disciplinaId?: string; // FK do novo Catálogo de Cursos
  turmaId?: string; // FK da nova entidade Turma
  autoGerada?: boolean; // Flag de imutabilidade parcial
  tipoAula?: TipoAula; // Tipo de aula (NORMAL ou PROGRAMA)
  origem?: OrigemPrograma; // Origem do programa (ex: JOVEM_APRENDIZ)
  contabilizaCarga?: boolean; // Se conta na carga horária (Dashboard)
  aulaExtra?: boolean; // Aula adicional além da carga horária planejada da matéria
  instrutorId?: string; // ID fixo do instrutor para evitar problemas de nome
}
export interface Instrutor {
  id: string;
  tenantId: string;
  nome: string;
  email?: string;
  telefone?: string;
}

export interface Curso {
  id: string;
  tenantId: string;
  nome: string;
  cargaHoraria?: string; // Ex: "40h"
  cor: string;
  minutosPorHora?: number; // 50 ou 60
  numeroCurso?: string; // Identificador Externo
  status: 'ativo' | 'concluido';
}

export interface Materia {
  id: string;
  tenantId: string;
  nome: string;
  cursoId: string; // Link to Course
  cargaHoraria?: number; // Carga horária total (meta) em horas
}

export type EventType = 'reuniao' | 'treinamento' | 'feedback' | 'ferias' | 'outro';
export type EventStatus = 'agendado' | 'concluido' | 'cancelado';

export interface Evento {
  id: string;
  tenantId: string;
  nome: string;
  tipo: EventType;
  data: Date;
  horarioInicio: string;
  horarioFim: string;
  instrutorId?: string; // Optional
  sala?: string;
  status: EventStatus;
}

export type ViewMode = 'dashboard' | 'daily' | 'monthly' | 'annual' | 'registrations' | 'admin' | 'room-map' | 'catalog' | 'calendar' | 'jovem-aprendiz' | 'privacy' | 'terms' | 'about' | 'settings';

export interface FilterState {
  search: string;
  instrutor: string;
  curso: string;
  status: ClassStatus | 'todos';
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserProfile {
  id?: string;
  tenantId: string; // Users belong to a specific unit
  name: string;
  email: string;
  avatarInitials: string;
  avatarUrl?: string; // Mapped from 'photo_url' in database
  role: UserRole;
}

// Admin Management Type
export interface UserAccount extends UserProfile {
  id: string;
  active: boolean;
  createdAt: string;
  tenantName?: string; // For display purposes
  invitationStatus: 'pending' | 'accepted'; // Invite flow status
  invitationToken?: string; // Mock token for security validation
  invitationExpires?: string; // Expiration date ISO string
}

// Audit Log Type
export interface SystemLog {
  id: string;
  tenantId: string; // Logs are isolated by tenant
  userId: string;
  userName: string;
  userRole: UserRole; // Snapshot of role at time of action
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN_FAIL' | 'USER_MGMT' | 'INVITE' | 'UNAUTHORIZED' | 'IMPORT';
  target: string; // "Aula: Matemática", "Usuário: João"
  details: string;
  status: 'success' | 'failure';
  timestamp: Date;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  defaultClassDuration: number; // in minutes
}

export interface Stats {
  totalAulas: number;
  totalHoras: number;
  instrutoresAtivos: number;
  aulasPorStatus: Record<ClassStatus, number>;
}

export interface AppNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
