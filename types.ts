export type ClassStatus = 'agendada' | 'em-andamento' | 'concluida' | 'cancelada';

export interface Aula {
  id: string;
  tenantId: string; // Multi-tenant isolation
  data: Date;
  horarioInicio: string; // "08:00"
  horarioFim: string;    // "10:00"
  instrutor: string;
  curso: string;
  materia: string;
  sala?: string;
  status: ClassStatus;
  cor?: string; // Hex para identificação visual
  observacoes?: string;
  minutosPorHora?: number; // Para cálculo de carga horária (50 ou 60)
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
}

export interface Materia {
  id: string;
  tenantId: string;
  nome: string;
  cursoId: string; // Link to Course
  cargaHoraria?: string; // Ex: "60h"
}

export type EventType = 'reuniao' | 'treinamento' | 'feedback' | 'outro';
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

export type ViewMode = 'dashboard' | 'daily' | 'monthly' | 'annual' | 'registrations' | 'admin';

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
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN_FAIL' | 'USER_MGMT' | 'INVITE' | 'UNAUTHORIZED';
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