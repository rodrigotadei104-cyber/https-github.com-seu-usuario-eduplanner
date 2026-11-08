import { useSyncExternalStore } from 'react';
import { turmaLessonExpectation } from '../../../utils/turmaChanges';
const mode = new URLSearchParams(location.search).get('mode');
const fixtureDay = (offset: number) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date; };
const teachers = [{ id: 'antigo', nome: 'Instrutor Atual' }, { id: 'novo', nome: 'Instrutor Novo' }];
const base: any = { id: 'a', tenantId: 'T', turmaId: 'turma', numeroTurma: 'DEMO-001', cursoId: 'curso', materiaId: 'teoria',
  instrutorId: 'antigo', instrutor: 'Instrutor Atual', data: fixtureDay(6), horarioInicio: '08:00', horarioFim: '10:00',
  curso: 'Curso demonstrativo', materia: 'Teoria', sala: 'Sala 4', status: 'agendada' };
let state = { aulas: [base, { ...base, id: 'b', materiaId: 'pratica', materia: 'Prática', horarioInicio: '10:00', horarioFim: '12:00' },
  { ...base, id: 'c', data: fixtureDay(13), materia: 'Revisão' },
  { ...base, id: 'e', data: fixtureDay(-3), materia: 'Aula adiada sem atualização' },
  { ...base, id: 'd', data: fixtureDay(-1), materia: 'Já concluída', status: 'concluida' }], trace: [] as string[] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const refreshData = async () => emit();
export const useSchedule = () => {
  const snapshot = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
  return { ...snapshot, instrutores: teachers, materias: [], cursos: [], eventos: [],
    userProfile: { role: mode === 'viewer' ? 'viewer' : 'admin', tenantId: 'T' }, refreshData };
};
export const tenantService = { getCurrentTenantId: () => 'T' };
export const permissionService = { checkPermission: async () => mode !== 'viewer' };
export const supabase = { rpc: async (name: string, args: any) => {
  const reschedule = name === 'reagendar_aulas_turma';
  const ids = reschedule ? args.p_changes.map((c: any) => c.id) : args.p_ids;
  const selected = state.aulas.filter(a => ids.includes(a.id));
  const snapshot: Array<Record<string, any>> = selected.map(a => ({ ...turmaLessonExpectation(a), ...(reschedule ? { nova_data: args.p_changes.find((c: any) => c.id === a.id).nova_data, motivo_reagendamento: args.p_motivo || '' } : {}) }));
  state = { ...state, trace: [...state.trace, args.p_aplicar ? 'CONFIRMAÇÃO' : 'PRÉVIA'] }; emit();
  if (mode === 'stale' && args.p_aplicar) return { error: { message: 'A agenda foi alterada. Atualize a tela e gere uma nova prévia.' }, data: null };
  const conflicts = mode === 'conflict' ? [{ id: 'evento', data: (snapshot[0] as any)?.nova_data || snapshot[0]?.data, inicio: '08:00', fim: '12:00', descricao: 'Instrutor ocupado em outra turma' }] : [];
  if (args.p_aplicar && !conflicts.length) {
    state = { ...state, aulas: state.aulas.map(a => !ids.includes(a.id) ? a : reschedule ? { ...a, data: new Date(args.p_changes.find((c: any) => c.id === a.id).nova_data + 'T00:00:00') } : args.p_tipo === 'sala' ? { ...a, sala: args.p_destino } : { ...a, instrutorId: args.p_destino, instrutor: teachers.find(t => t.id === args.p_destino)?.nome || '' }) }; emit();
  }
  return { error: null, data: { snapshot, conflicts, changedCount: selected.length, applied: args.p_aplicar && !conflicts.length } };
} };
