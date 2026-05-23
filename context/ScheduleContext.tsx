// ============================================
// SCHEDULE CONTEXT
// Estado global integrado com Services
// ============================================
// NOTA: Este contexto NÃO contém regras de negócio.
// Todas as validações (permissão, tenant, status) são feitas nos services.
// O contexto apenas consume e exibe dados do backend.

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { FilterState, ViewMode, AppSettings, AppNotification, UserRole, Aula, Instrutor, Curso, Materia, Stats, UserAccount, SystemLog, Evento } from '../types';

// Services
import {
  authService,
  aulaService,
  userService,
  instrutorService,
  cursoService,
  materiaService,
  auditService,
  permissionService,
  eventService,
  EventInput
} from '../services';
import { calendarioService } from '../services/calendario.service';
import { supabase } from '../lib/supabase';

// ============================================
// TYPES (Backward Compatible)
// ============================================

interface UserProfileState {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  avatarInitials: string;
  role: UserRole;
  avatarUrl?: string;
}

interface ScheduleContextType {
  // Auth
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  enterDemoMode: () => void;
  activateAccount: (email: string, password: string, nameConfirm: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;

  // Data
  aulas: Aula[];
  instrutores: Instrutor[];
  cursos: Curso[];
  materias: Materia[];
  users: UserAccount[];
  systemLogs: SystemLog[];
  eventos: Evento[];
  feriadosSet: Set<string>;                              // YYYY-MM-DD para lookup rápido
  feriados: Array<{ data: string; descricao: string; tipo: string }>; // para tooltip/label

  filteredAulas: Aula[];
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  filters: FilterState;
  setFilters: (filters: FilterState | ((prev: FilterState) => FilterState)) => void;

  // Actions - Aulas (backward compatible signatures)
  addAula: (aula: Omit<Aula, 'id' | 'tenantId'>, forceCreate?: boolean) => Promise<{
    success: boolean;
    warning?: 'INSTRUCTOR_CONFLICT' | 'ROOM_CONFLICT';
    conflicts?: Array<{ aulaId: string; materia: string; horarioInicio: string; horarioFim: string }>;
    error?: string;
  }>;
  updateAula: (aula: Aula, forceUpdate?: boolean, propagateRoom?: boolean) => Promise<{
    success: boolean;
    warning?: 'INSTRUCTOR_CONFLICT' | 'ROOM_CONFLICT';
    conflicts?: Array<{ aulaId: string; materia: string; horarioInicio: string; horarioFim: string }>;
    error?: string;
  }>;
  addAulaPrograma: (data: Omit<Aula, 'id' | 'tenantId'>, forceCreate?: boolean) => Promise<{
    success: boolean;
    warning?: 'INSTRUCTOR_CONFLICT' | 'ROOM_CONFLICT';
    conflicts?: Array<{ aulaId: string; materia: string; horarioInicio: string; horarioFim: string }>;
    error?: string;
  }>;
  deleteAula: (id: string) => Promise<boolean>;
  deleteAulaPrograma: (id: string) => Promise<boolean>;
  deleteAulasTurma: (cursoId: string, numeroTurma: string, turmaId?: string, cursoNome?: string) => Promise<boolean>;

  // Actions - Registrations
  addInstrutor: (data: Omit<Instrutor, 'id' | 'tenantId'>) => void;
  deleteInstrutor: (id: string) => void;
  addCurso: (data: Omit<Curso, 'id' | 'tenantId'>) => void;
  updateCurso: (id: string, data: Partial<Curso>) => void;
  deleteCurso: (id: string) => void;
  addMateria: (data: Omit<Materia, 'id' | 'tenantId'>) => void;
  deleteMateria: (id: string) => void;

  // Actions - Events
  addEvento: (data: Omit<EventInput, 'tenantId'>) => Promise<void>;
  updateEvento: (id: string, data: Partial<EventInput>) => Promise<void>;
  replaceEventos: (ids: string[], data: Omit<EventInput, 'tenantId'>) => Promise<void>;
  deleteEvento: (id: string) => Promise<void>;
  deleteEventos: (ids: string[]) => Promise<void>;

  // Actions - Users
  createUser: (data: Omit<UserAccount, 'id' | 'createdAt' | 'avatarInitials' | 'tenantId' | 'active' | 'invitationStatus'>) => void;
  updateUserStatus: (userId: string, active: boolean) => void;
  updateUserRole: (userId: string, role: UserRole) => void;
  resendInvitation: (userId: string) => Promise<void>;
  acceptInvitation: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  setTestPassword: (userId: string, password: string) => Promise<void>;

  // Stats
  stats: Stats;

  // User Profile
  userProfile: UserProfileState;
  updateUserProfile: (profile: UserProfileState) => void;
  appSettings: AppSettings;
  updateAppSettings: (settings: AppSettings) => void;

  // Notifications
  notification: AppNotification | null;
  closeNotification: () => void;
  isActionLoading: boolean;

  // Permissions Helpers (UI only - backend validates)
  canManageClasses: () => boolean;
  canManageRegistrations: () => boolean;

  // Data Refresh
  refreshData: () => Promise<void>;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export const ScheduleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfileState>({
    id: '',
    tenantId: '',
    name: '',
    email: '',
    avatarInitials: '',
    role: 'viewer',
    avatarUrl: undefined
  });

  // --- Data State ---
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [feriadosSet, setFeriadosSet] = useState<Set<string>>(new Set());
  const [feriados, setFeriados] = useState<Array<{ data: string; descricao: string; tipo: string }>>([]);

  // --- UI State ---
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    instrutor: '',
    curso: '',
    status: 'todos',
  });

  const [appSettings, setAppSettings] = useState<AppSettings>({
    theme: 'light',
    defaultClassDuration: 120
  });

  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  // --- Theme Effect ---
  useEffect(() => {
    if (appSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [appSettings.theme]);

  // --- Notification Helpers ---
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotification({ id, message, type });
    setTimeout(() => {
      setNotification(prev => prev?.id === id ? null : prev);
    }, 4000);
  }, []);

  const closeNotification = useCallback(() => setNotification(null), []);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadAllData = useCallback(async () => {
    if (!isAuthenticated && !isDemo) return;

    try {
      setIsLoading(true);
      // Load ALL data in parallel (including feriados) for maximum speed
      const [aulasData, instrutoresData, cursosData, materiasData, eventsData, feriadosData] = await Promise.all([
        aulaService.list({ includeRelations: true }).catch(() => []),
        instrutorService.list().catch(() => []),
        cursoService.list().catch(() => []),
        materiaService.list().catch(() => []),
        eventService.list().catch(() => []),
        calendarioService.getFeriados().catch(() => [])
      ]);

      // Fire-and-forget: sync statuses in background AFTER data is loaded
      // This ensures UI renders immediately while statuses update silently
      if (!isDemo) {
        aulaService.syncClassStatuses().catch(err => console.error('Sync error:', err));
      }

      // Process feriados
      const novoFeriadosSet = new Set(feriadosData.map((f: any) => String(f.data || f.dataReferencia || '').substring(0, 10)));
      setFeriadosSet(novoFeriadosSet);
      setFeriados(feriadosData.map((f: any) => ({
        data: String(f.data || f.dataReferencia || '').substring(0, 10),
        descricao: f.descricao || f.nome || 'Feriado',
        tipo: f.tipo || 'nacional',
      })));


      // Transform to legacy format if needed
      setAulas(aulasData.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        data: a.data instanceof Date ? a.data : new Date(a.data + 'T00:00:00'),
        horarioInicio: a.horario_inicio,
        horarioFim: a.horario_fim,
        instrutor: a.instrutor?.nome || '',
        curso: a.curso?.nome || a.disciplina?.curso?.nome_curso || '',
        materia: a.materia?.nome || a.disciplina?.nome_disciplina || '',
        sala: a.sala || '',
        status: a.status === 'em_andamento' ? 'em-andamento' : a.status,
        observacoes: a.observacoes || '',
        cor: a.curso?.cor || '#3B82F6',
        minutosPorHora: a.curso?.minutos_por_hora || 60,
        numeroCurso: a.curso?.numero_curso,
        numeroTurma: a.numero_turma, // New field for Cohort separation
        cargaHorariaMateria: a.carga_horaria_materia,
        cursoId: a.curso_id,
        materiaId: a.materia_id,
        tipoAula: a.tipo_aula || 'NORMAL',
        origem: a.origem,
        contabilizaCarga: a.contabiliza_carga ?? true,
        instrutorId: a.instrutor_id,
        turmaId: a.turma_id
      })));


      setInstrutores(instrutoresData.map((i: any) => ({
        id: i.id,
        tenantId: i.tenant_id,
        nome: i.nome,
        email: i.email,
        telefone: i.telefone
      })));

      setCursos(cursosData.map((c: any) => ({
        id: c.id,
        tenantId: c.tenant_id,
        nome: c.nome,
        cargaHoraria: c.carga_horaria,
        cor: c.cor,
        minutosPorHora: c.minutosPorHora || c.minutos_por_hora,
        numeroCurso: c.numeroCurso || c.numero_curso,
        status: c.status || 'ativo'
      })));

      setMaterias(materiasData.map((m: any) => ({
        id: m.id,
        tenantId: m.tenant_id,
        nome: m.nome,
        cursoId: m.curso_id,
        cargaHoraria: m.carga_horaria
      })));

      setEventos((eventsData as unknown as Evento[]) || []);
      // Load admin data only if admin
      const isAdminFlag = permissionService.isAdmin();

      if (isAdminFlag) {
        try {
          const [usersData, logsData] = await Promise.all([
            userService.list(),
            auditService.getLogs(100)
          ]);

          const mappedUsers = (usersData as any[]).map(u => {
            const initials = u.name
              ? u.name.split(' ').filter(Boolean).map((n: any) => n[0]).join('').toUpperCase().substring(0, 2)
              : '??';

            return {
              id: u.id,
              tenantId: u.tenant_id || '',
              email: u.email,
              name: u.name,
              role: u.role,
              active: u.status !== 'inactive',
              invitationStatus: u.status === 'pending' ? 'pending' : 'accepted',
              createdAt: u.created_at || new Date().toISOString(),
              avatarInitials: initials
            };
          });
          setUsers(mappedUsers as any);
          setSystemLogs(logsData as any);
        } catch (e) {
          console.error('FAILED to load admin data:', e);
          setUsers([]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isDemo]);

  // ============================================
  // AUTH
  // ============================================

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const restored = await authService.restoreSession();
        if (restored) {
          const profile = await authService.getCurrentUser();
          if (profile) {
            // CRÍTICO: inicializar permissionService antes de loadAllData
            permissionService.setCurrentUser(profile.id, profile.role as UserRole);
            setUserProfile({
              id: profile.id,
              tenantId: profile.tenant_id,
              name: profile.name,
              email: profile.email,
              avatarInitials: profile.name.substring(0, 2).toUpperCase(),
              role: profile.role as UserRole,
              avatarUrl: profile.photo_url
            });
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        console.error('Session restore error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated || isDemo) {
      loadAllData();
    }
  }, [isAuthenticated, isDemo, loadAllData]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const result = await authService.login(email, password);

      if (result.success) {
        const profile = await authService.getCurrentUser();
        if (profile) {
          // CRÍTICO: inicializar permissionService antes de loadAllData
          permissionService.setCurrentUser(profile.id, profile.role as UserRole);
          setUserProfile({
            id: profile.id,
            tenantId: profile.tenant_id,
            name: profile.name,
            email: profile.email,
            avatarInitials: profile.name.substring(0, 2).toUpperCase(),
            role: profile.role as UserRole,
            avatarUrl: profile.photo_url
          });
          setIsAuthenticated(true);
          showNotification(`Bem-vindo, ${profile.name.split(' ')[0]}!`, 'success');
          return true;
        }
      }

      throw new Error(result.error || 'Erro no login.');
    } catch (error: any) {
      showNotification(error.message || 'Credenciais inválidas.', 'error');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const enterDemoMode = useCallback(() => {
    setIsDemo(true);
    setIsAuthenticated(true);
    setUserProfile({
      id: 'demo-1',
      tenantId: 'demo-tenant-1',
      name: 'Admin Demo',
      email: 'admin@demo.com',
      avatarInitials: 'AD',
      role: 'admin'
    });
    showNotification('Modo demonstração ativado!', 'info');
  }, [showNotification]);

  const activateAccount = useCallback(async (email: string, password: string, nameConfirm: string): Promise<boolean> => {
    try {
      setIsLoading(true);

      // 1. Chamar Edge Function para definir senha usando Admin API
      const { data: functionData, error: functionError } = await supabase.functions.invoke('activate-invited-user', {
        body: { email, password }
      });

      if (functionError) {
        showNotification(functionError.message || 'Erro ao ativar conta.', 'error');
        return false;
      }

      if (functionData?.error) {
        showNotification(functionData.error, 'error');
        return false;
      }

      // 2. Agora fazer login com a senha que acabamos de definir
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        showNotification('Conta ativada, mas erro no login. Tente fazer login manualmente.', 'info');
        return false;
      }

      showNotification('Conta ativada com sucesso! Bem-vindo!', 'success');

      // 4. Recarregar página para atualizar sessão e perfil
      window.location.reload();
      return true;

    } catch (error: any) {
      console.error('Erro na ativação:', error);
      showNotification(error.message || 'Falha ao ativar conta.', 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    try {
      setIsLoading(true);
      const result = await authService.resetPasswordForEmail(email);
      if (!result.success) {
        throw new Error(result.error || 'Falha ao enviar e-mail de recuperação.');
      }
    } catch (error: any) {
      showNotification(error.message, 'error');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const logout = useCallback(async () => {
    await authService.logout();

    setIsAuthenticated(false);
    setIsDemo(false);
    setIsAuthenticated(false);
    setIsDemo(false);
    setUserProfile({ id: '', tenantId: '', name: '', email: '', avatarInitials: '', role: 'viewer', avatarUrl: undefined });
    setAulas([]);
    setInstrutores([]);
    setCursos([]);
    setMaterias([]);
    setUsers([]);
    setSystemLogs([]);
    setFilters({ search: '', instrutor: '', curso: '', status: 'todos' });

    showNotification('Você saiu do sistema.', 'info');
  }, [showNotification]);

  // ============================================
  // AULAS ACTIONS
  // ============================================

  const addAula = useCallback(async (data: Omit<Aula, 'id' | 'tenantId'>, forceCreate: boolean = false) => {
    // Transform legacy format to service format
    // FIX: Usar formato local para evitar problema de fuso horário
    let dateStr: string;
    if (typeof data.data === 'string') {
      dateStr = data.data;
    } else if (data.data instanceof Date) {
      // Formatar manualmente para evitar conversão UTC
      const d = data.data;
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      dateStr = String(data.data);
    }
    const serviceInput = {
      data: dateStr,
      horario_inicio: data.horarioInicio,
      horario_fim: data.horarioFim,
      instrutor_id: instrutores.find(i => i.nome === data.instrutor)?.id || '',
      curso_id: cursos.find(c => c.nome === data.curso)?.id || '',
      materia_id: materias.find(m => m.nome === data.materia)?.id || '',
      sala: data.sala,
      observacoes: data.observacoes,
      numero_turma: data.numeroTurma // Pass custom cohort number
    };

    const result = await aulaService.create(serviceInput, forceCreate);

    // Se há warning de conflito (Instrutor ou Sala), retornar para o componente tratar
    if (result.warning) {
      return {
        success: false,
        warning: result.warning,
        conflicts: result.conflicts || []
      };
    }

    if (result.success) {
      await loadAllData();
      showNotification('Aula criada com sucesso.', 'success');
      return { success: true };
    } else {
      showNotification(result.error || 'Erro ao criar aula.', 'error');
      return { success: false, error: result.error };
    }
  }, [instrutores, cursos, materias, loadAllData, showNotification]);

  const addAulaPrograma = useCallback(async (data: Omit<Aula, 'id' | 'tenantId'>, forceCreate: boolean = false) => {
    let dateStr: string;
    if (typeof data.data === 'string') {
      dateStr = data.data;
    } else if (data.data instanceof Date) {
      const d = data.data;
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      dateStr = String(data.data);
    }

    // 1. Criar objeto otimista para atualização instantânea
    const tempId = `temp-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticAula: Aula = {
      ...data,
      id: tempId,
      tenantId: userProfile.tenantId,
      data: data.data instanceof Date ? data.data : new Date(data.data),
      status: 'agendada'
    };

    // 2. Atualizar estado imediatamente
    setAulas(prev => [...prev, optimisticAula]);

    const serviceInput = {
      data: dateStr,
      horario_inicio: data.horarioInicio,
      horario_fim: data.horarioFim,
      instrutor_id: data.instrutorId || null, // NUNCA enviar '' (vazio) para UUID, usar NULL
      sala: data.sala,
      observacoes: data.observacoes,
      tipo_aula: data.tipoAula || 'PROGRAMA',
      origem: data.origem || 'PROGRAMA',
      contabiliza_carga: data.contabilizaCarga ?? true,
      carga_horaria_materia: data.cargaHorariaMateria
    };

    const result = await aulaService.createPrograma(serviceInput, forceCreate);

    if (result.warning) {
      // Reverter alteração otimista em caso de conflito/aviso para o usuário decidir
      setAulas(prev => prev.filter(a => a.id !== tempId));
      return {
        success: false,
        warning: result.warning,
        conflicts: result.conflicts || []
      };
    }

    if (result.success && result.data) {
      // 3. Atualizar o ID temporário com o real do banco, sem recarregar tudo
      setAulas(prev => prev.map(a => a.id === tempId ? { ...a, id: (result.data as any).id } : a));
      showNotification('Programa cadastrado com sucesso.', 'success');
      return { success: true };
    } else {
      // Reverter em caso de erro real
      setAulas(prev => prev.filter(a => a.id !== tempId));
      showNotification(result.error || 'Erro ao compor agenda.', 'error');
      return { success: false, error: result.error };
    }
  }, [instrutores, userProfile.tenantId, showNotification]);

  const updateAula = useCallback(async (data: Aula, forceUpdate: boolean = false, propagateRoom: boolean = false) => {
    // FIX: Usar formato local para evitar problema de fuso horário
    let dateStr: string;
    if (typeof data.data === 'string') {
      dateStr = data.data;
    } else if (data.data instanceof Date) {
      const d = data.data;
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      dateStr = String(data.data);
    }
    const serviceInput = {
      data: dateStr,
      horario_inicio: data.horarioInicio,
      horario_fim: data.horarioFim,
      instrutor_id: instrutores.find(i => i.nome === data.instrutor)?.id,
      curso_id: cursos.find(c => c.nome === data.curso)?.id,
      materia_id: materias.find(m => m.nome === data.materia)?.id,
      sala: data.sala,
      status: data.status === 'em-andamento' ? 'em_andamento' as const : data.status as any,
      observacoes: data.observacoes,
      numero_turma: data.numeroTurma // Update custom cohort number
    };

    console.log('[DEBUG-UPDATE] Sending payload:', serviceInput);


    try {
      setIsActionLoading(true);
      const result = await aulaService.update(data.id, serviceInput, forceUpdate, propagateRoom);

      if (result.warning) {
        return {
          success: false,
          warning: result.warning,
          conflicts: result.conflicts || []
        };
      }

      if (result.success) {
        await loadAllData();
        showNotification('Aula atualizada com sucesso!', 'success');
        return { success: true };
      } else {
        showNotification(result.error || 'Erro ao atualizar aula.', 'error');
        return { success: false, error: result.error };
      }
    } catch (e: any) {
      showNotification(e.message || 'Erro inesperado.', 'error');
      return { success: false, error: e.message };
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification, instrutores, cursos, materias]);

  const deleteAula = useCallback(async (id: string): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      const result = await aulaService.delete(id);
      if (result.success) {
        setAulas(prev => prev.filter(a => a.id !== id));
        showNotification('Aula excluída permanentemente.', 'success');
        return true;
      } else {
        showNotification(result.error || 'Erro ao excluir aula.', 'error');
        return false;
      }
    } catch (error: any) {
      showNotification(error.message || 'Erro inesperado.', 'error');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [showNotification]);

  const deleteAulaPrograma = useCallback(async (id: string): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      const result = await aulaService.deleteAulaPrograma(id);
      if (result.success) {
        setAulas(prev => prev.filter(a => a.id !== id));
        showNotification('Programa removido com sucesso.', 'success');
        return true;
      } else {
        showNotification(result.error || 'Erro ao remover programa.', 'error');
        return false;
      }
    } catch (error: any) {
      showNotification(error.message || 'Erro inesperado.', 'error');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [showNotification]);

  const deleteAulasTurma = useCallback(async (cursoId: string, numeroTurma: string, turmaId?: string, cursoNome?: string): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      const result = await aulaService.deleteAulasTurma(cursoId, numeroTurma, turmaId, cursoNome);
      if (result.success) {
        // Filtra localmente todas as aulas dessa turma e curso (passado, presente e futuro) de forma normalizada e robusta
        setAulas(prev => prev.filter(a => {
          // Se deletou especificamente por turmaId (Nova Arquitetura), remove as correspondentes
          if (turmaId && a.turmaId === turmaId) {
            return false;
          }

          const matchCurso = a.cursoId === cursoId;
          
          // Normaliza valores para comparar corretamente undefined, null, strings vazias ou a string 'null'
          const getNorm = (v: any) => {
            const s = String(v || '').trim();
            return (s === 'null' || s === 'undefined') ? '' : s;
          };
          const matchTurma = getNorm(a.numeroTurma) === getNorm(numeroTurma);
          
          return !(matchCurso && matchTurma);
        }));
        showNotification('Grade de aulas removida com sucesso.', 'success');
        return true;
      } else {
        showNotification(result.error || 'Erro ao remover grade.', 'error');
        return false;
      }
    } catch (error: any) {
      showNotification(error.message || 'Erro inesperado.', 'error');
      return false;
    } finally {
      setIsActionLoading(false);
    }
  }, [showNotification]);

  // ============================================
  // REGISTRATIONS ACTIONS
  // ============================================

  const addInstrutor = useCallback(async (data: Omit<Instrutor, 'id' | 'tenantId'>) => {
    try {
      setIsActionLoading(true);
      const result = await instrutorService.create({ nome: data.nome, email: data.email, telefone: data.telefone });
      if (result.success) {
        await loadAllData();
        showNotification('Instrutor cadastrado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao cadastrar instrutor.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const deleteInstrutor = useCallback(async (id: string) => {
    const result = await instrutorService.delete(id);
    if (result.success) {
      await loadAllData();
      showNotification('Instrutor removido.', 'success');
    } else {
      showNotification(result.error || 'Erro.', 'error');
    }
  }, [loadAllData, showNotification]);

  const addCurso = useCallback(async (data: Omit<Curso, 'id' | 'tenantId'>) => {
    const result = await cursoService.create({
      nome: data.nome,
      carga_horaria: Number(data.cargaHoraria) || undefined,
      cor: data.cor,
      minutos_por_hora: data.minutosPorHora,
      numero_curso: data.numeroCurso,
      status: data.status
    });
    if (result.success) {
      await loadAllData();
      showNotification('Curso cadastrado.', 'success');
    } else {
      showNotification(result.error || 'Erro.', 'error');
    }
  }, [loadAllData, showNotification]);

  const updateCurso = useCallback(async (id: string, data: Partial<Curso>) => {
    try {
      setIsActionLoading(true);
      const result = await cursoService.update(id, {
        ...data,
        carga_horaria: Number(data.cargaHoraria) || undefined,
        minutos_por_hora: data.minutosPorHora,
        numero_curso: data.numeroCurso
      });
      if (result.success) {
        await loadAllData();
        showNotification('Curso atualizado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao atualizar curso.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const deleteCurso = useCallback(async (id: string) => {
    const result = await cursoService.delete(id);
    if (result.success) {
      await loadAllData();
      showNotification('Curso removido.', 'success');
    } else {
      showNotification(result.error || 'Erro.', 'error');
    }
  }, [loadAllData, showNotification]);

  const addMateria = useCallback(async (data: Omit<Materia, 'id' | 'tenantId'>) => {
    const result = await materiaService.create({ nome: data.nome, curso_id: data.cursoId, carga_horaria: Number(data.cargaHoraria) || undefined });
    if (result.success) {
      await loadAllData();
      showNotification('Matéria cadastrada.', 'success');
    } else {
      showNotification(result.error || 'Erro.', 'error');
    }
  }, [loadAllData, showNotification]);

  const deleteMateria = useCallback(async (id: string) => {
    try {
      setIsActionLoading(true);
      const result = await materiaService.delete(id);
      if (result.success) {
        await loadAllData();
        showNotification('Matéria removida com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao remover matéria.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  // ============================================
  // EVENT ACTIONS
  // ============================================

  const addEvento = useCallback(async (data: Omit<EventInput, 'tenantId'>) => {
    try {
      setIsActionLoading(true);
      const result = await eventService.create(data as any);
      if (result.success) {
        await loadAllData();
        showNotification('Evento criado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao criar evento.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const updateEvento = useCallback(async (id: string, data: Partial<EventInput>) => {
    try {
      setIsActionLoading(true);
      const result = await eventService.update(id, data);
      if (result.success) {
        await loadAllData();
        showNotification('Evento atualizado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao atualizar evento.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const replaceEventos = useCallback(async (ids: string[], data: Omit<EventInput, 'tenantId'>) => {
    try {
      setIsActionLoading(true);
      const result = await eventService.replaceMany(ids, data as any);
      if (result.success) {
        await loadAllData();
        showNotification('PerÃ­odo atualizado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao atualizar perÃ­odo.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const deleteEvento = useCallback(async (id: string) => {
    try {
      setIsActionLoading(true);
      const result = await eventService.delete(id);
      if (result.success) {
        await loadAllData();
        showNotification('Evento removido.', 'success');
      } else {
        showNotification(result.error || 'Erro ao remover evento.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const deleteEventos = useCallback(async (ids: string[]) => {
    try {
      setIsActionLoading(true);
      const result = await eventService.deleteMany(ids);
      if (result.success) {
        await loadAllData();
        showNotification('PerÃ­odo removido.', 'success');
      } else {
        showNotification(result.error || 'Erro ao remover perÃ­odo.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  // ============================================
  // USER MANAGEMENT ACTIONS
  // ============================================

  const createUser = useCallback(async (data: any) => {
    try {
      setIsActionLoading(true);
      const result = await userService.create({ email: data.email, name: data.name, role: data.role });
      if (result.success) {
        await loadAllData();
        showNotification('Convite enviado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao enviar convite.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const updateUserStatus = useCallback(async (userId: string, active: boolean) => {
    try {
      setIsActionLoading(true);
      const result = await userService.updateStatus(userId, active ? 'active' : 'inactive');
      if (result.success) {
        await loadAllData();
        showNotification('Status do usuário atualizado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao atualizar status.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const updateUserRole = useCallback(async (userId: string, role: UserRole) => {
    try {
      setIsActionLoading(true);
      const result = await userService.updateRole(userId, role);
      if (result.success) {
        await loadAllData();
        showNotification('Nível de acesso atualizado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao atualizar nível de acesso.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  const resendInvitation = useCallback(async (userId: string) => {
    try {
      setIsActionLoading(true);
      const result = await userService.resendInvitation(userId);
      if (result.success) {
        showNotification('Convite reenviado com sucesso!', 'success');
      } else {
        showNotification(result.error || 'Erro ao reenviar convite.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [showNotification]);

  const acceptInvitation = useCallback(async (userId: string) => {
    const result = await userService.acceptInvitation(userId);
    if (result.success) {
      await loadAllData();
      showNotification('Convite aceito com sucesso! Usuário ativado.', 'success');
    } else {
      showNotification(result.error || 'Erro ao aceitar convite.', 'error');
    }
  }, [loadAllData, showNotification]);

  const deleteUser = useCallback(async (userId: string) => {
    try {
      setIsActionLoading(true);
      const result = await userService.delete(userId);
      if (result.success) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        showNotification('Usuário excluído com sucesso.', 'success');
      } else {
        showNotification(result.error || 'Erro ao excluir usuário.', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  }, [showNotification]);

  const setTestPassword = useCallback(async (userId: string, password: string) => {
    try {
      setIsActionLoading(true);
      const result = await userService.setTestPassword(userId, password);
      if (result.success) {
        await loadAllData();
        showNotification('Senha de teste definida! Você será deslogado para testar o novo usuário.', 'success');
        setTimeout(() => {
          authService.logout();
          window.location.reload();
        }, 2000);
      } else {
        showNotification(result.error || 'Erro ao definir senha.', 'error');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [loadAllData, showNotification]);

  // ============================================
  // FILTERED AULAS & STATS (computed from data)
  // ============================================

  const filteredAulas = useMemo(() => {
    return aulas.filter((aula) => {
      const matchesSearch =
        aula.materia.toLowerCase().includes(filters.search.toLowerCase()) ||
        aula.instrutor.toLowerCase().includes(filters.search.toLowerCase()) ||
        aula.curso.toLowerCase().includes(filters.search.toLowerCase());

      const matchesInstrutor = filters.instrutor ? aula.instrutor === filters.instrutor : true;
      const matchesCurso = filters.curso ? aula.curso === filters.curso : true;
      const matchesStatus = filters.status !== 'todos' ? aula.status === filters.status : true;

      return matchesSearch && matchesInstrutor && matchesCurso && matchesStatus;
    });
  }, [aulas, filters]);

  const stats = useMemo((): Stats => {
    let totalAulas = 0;
    let totalMinutes = 0;
    const instructors = new Set<string>();
    const statusCounts: Record<string, number> = { agendada: 0, 'em-andamento': 0, concluida: 0, cancelada: 0 };

    filteredAulas.forEach(aula => {
      if (statusCounts[aula.status] !== undefined) statusCounts[aula.status]++;

      if (aula.status !== 'cancelada') {
        instructors.add(aula.instrutor);
        totalAulas++;
        const [sh, sm] = (aula.horarioInicio || '00:00').split(':').map(Number);
        const [eh, em] = (aula.horarioFim || '00:00').split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) totalMinutes += diff;
      }
    });

    return {
      totalAulas,
      totalHoras: Math.round(totalMinutes / 60),
      instrutoresAtivos: instructors.size,
      aulasPorStatus: statusCounts as any
    };
  }, [filteredAulas]);

  // ============================================
  // SETTINGS & PROFILE
  // ============================================

  const updateUserProfile = useCallback((profile: UserProfileState) => {
    // Only allow name and avatar changes, not role/tenant
    setUserProfile(prev => ({
      ...prev,
      name: profile.name,
      avatarInitials: profile.avatarInitials,
      avatarUrl: profile.avatarUrl
    }));
  }, []);

  const updateAppSettings = useCallback((settings: AppSettings) => {
    setAppSettings(settings);
  }, []);

  // ============================================
  // PERMISSION HELPERS (UI only - backend validates)
  // ============================================

  const canManageClasses = useCallback(() => {
    return userProfile.role === 'admin' || userProfile.role === 'editor';
  }, [userProfile.role]);

  const canManageRegistrations = useCallback(() => {
    return userProfile.role === 'admin' || userProfile.role === 'editor';
  }, [userProfile.role]);

  // ============================================
  // PROVIDER VALUE
  // ============================================

  return (
    <ScheduleContext.Provider
      value={useMemo(() => ({
        isAuthenticated,
        isLoading,
        isDemo,
        login,
        logout,
        enterDemoMode,
        activateAccount,
        resetPassword,

        aulas,
        instrutores,
        cursos,
        materias,
        users,
        systemLogs,
        eventos,

        filteredAulas,
        currentDate,
        setCurrentDate,
        viewMode,
        setViewMode,
        filters,
        setFilters,

        addAula,
        updateAula,
        addAulaPrograma,
        deleteAula,
        deleteAulaPrograma,
        deleteAulasTurma,

        addInstrutor,
        deleteInstrutor,
        addCurso,
        updateCurso,
        deleteCurso,
        addMateria,
        deleteMateria,

        addEvento,
        updateEvento,
        replaceEventos,
        deleteEvento,
        deleteEventos,

        createUser,
        updateUserStatus,
        updateUserRole,
        resendInvitation,
        acceptInvitation,
        deleteUser,
        setTestPassword,

        stats,

        userProfile,
        updateUserProfile,
        appSettings,
        updateAppSettings,

        notification,
        closeNotification,
        isActionLoading,

        canManageClasses,
        canManageRegistrations,
        refreshData: loadAllData,
        feriadosSet,
        feriados,
      }), [
        isAuthenticated, isLoading, isDemo, login, logout, enterDemoMode, activateAccount, resetPassword,
        aulas, instrutores, cursos, materias, users, systemLogs, eventos, feriadosSet, feriados,
        filteredAulas, currentDate, viewMode, filters,
        addAula, updateAula, addAulaPrograma, deleteAula, deleteAulaPrograma, deleteAulasTurma,
        addInstrutor, deleteInstrutor, addCurso, updateCurso, deleteCurso, addMateria, deleteMateria,
        addEvento, updateEvento, replaceEventos, deleteEvento, deleteEventos,
        createUser, updateUserStatus, updateUserRole, resendInvitation, acceptInvitation, deleteUser, setTestPassword,
        stats,
        userProfile, updateUserProfile, appSettings, updateAppSettings,
        notification, closeNotification, isActionLoading,
        canManageClasses, canManageRegistrations, loadAllData
      ])}
    >
      {children}
    </ScheduleContext.Provider>
  );
};

export const useSchedule = () => {
  const context = useContext(ScheduleContext);
  if (context === undefined) {
    throw new Error('useSchedule must be used within a ScheduleProvider');
  }
  return context;
};
