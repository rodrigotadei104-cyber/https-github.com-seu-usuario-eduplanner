import React, { useState, useEffect, useMemo } from 'react';
import { Aula } from '../types';
import { X, Trash2, Loader2, AlertTriangle, Check, XCircle, Lock, Info, Ban, Search } from 'lucide-react';
import { useSchedule } from '../context/ScheduleContext';
import { addMinutes, format, parseISO } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';
import { Avatar } from './Avatar';

// Helper para parsear data sem problema de fuso horário
const parseLocalDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  return parseISO(dateStr);
};

interface ClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (aula: Omit<Aula, 'id'> | Aula) => void;
  initialData?: Aula | null;
}

export const ClassModal: React.FC<ClassModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const { instrutores, cursos, materias, appSettings, currentDate, userProfile, addAula, updateAula, deleteAula, isActionLoading } = useSchedule();

  const [propagateRoom, setPropagateRoom] = useState(false);
  const [formData, setFormData] = useState<Partial<Aula>>({
    data: new Date(),
    horarioInicio: '08:00',
    horarioFim: '10:00',
    instrutor: '',
    curso: '',
    materia: '',
    sala: '',
    status: 'agendada',
    cor: '#3b82f6',
    observacoes: '',
  });

  // Confirmation State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    action: () => { }
  });

  // Conflict Modal State
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    type: 'INSTRUCTOR_CONFLICT' | 'ROOM_CONFLICT' | null;
    conflicts: Array<{ aulaId: string; materia: string; horarioInicio: string; horarioFim: string }>;
    pendingData: Partial<Aula> | null;
  }>({
    isOpen: false,
    type: null,
    conflicts: [],
    pendingData: null
  });

  // --- Permission Logic ---
  const isAdmin = userProfile.role === 'admin';
  const isEditor = userProfile.role === 'editor';
  const isViewer = userProfile.role === 'viewer';

  // State Logic
  const isFinalState = initialData?.status === 'concluida' || initialData?.status === 'cancelada';
  const isConcluded = initialData?.status === 'concluida';

  // Read Only if Viewer OR Final State
  const isReadOnly = isViewer || (!!initialData && isFinalState);

  // Can Save (Edit/Create): Admin or Editor, unless readOnly (but allow editing concluded if not viewer)
  const canSave = !isViewer && (!isReadOnly || isConcluded);

  // Helper for inputs that should be editable even when concluded
  // If concluded, we want to allow editing (so not locked).
  // If readOnly is true (due to final state) AND it IS concluded -> Allow (Not Locked)
  // If readOnly is true AND NOT concluded (e.g. cancelled or viewer) -> Locked.
  const isLocked = isViewer || (isReadOnly && !isConcluded);

  // Can Cancel: Only Admin, if not already cancelled/concluded
  const canCancel = isAdmin && !!initialData && !isFinalState;

  // Filter materias based on selected course
  const filteredMaterias = useMemo(() => {
    if (!formData.curso) return [];
    const selectedCursoObj = cursos.find(c => c.nome === formData.curso);
    if (!selectedCursoObj) return [];
    return materias.filter(m => m.cursoId === selectedCursoObj.id);
  }, [formData.curso, cursos, materias]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          ...initialData,
          numeroTurma: initialData.numeroTurma || initialData.numeroCurso || ''
        });
      } else {
        const defaultCurso = cursos[0];
        const startTime = '08:00';
        const [h, m] = startTime.split(':').map(Number);
        const baseDate = new Date(currentDate);
        baseDate.setHours(h, m, 0, 0);
        const endDate = addMinutes(baseDate, appSettings.defaultClassDuration);
        const endTime = format(endDate, 'HH:mm');

        setFormData({
          data: baseDate,
          horarioInicio: startTime,
          horarioFim: endTime,
          instrutor: instrutores[0]?.nome || '',
          curso: defaultCurso?.nome || '',
          materia: '',
          sala: '',
          status: 'agendada',
          cor: defaultCurso?.cor || '#3b82f6',
          observacoes: '',
          numeroCurso: defaultCurso?.numeroCurso || '',
          numeroTurma: defaultCurso?.numeroCurso || ''
        });
      }
    }
  }, [isOpen, initialData, instrutores, cursos, appSettings.defaultClassDuration, currentDate]);

  if (!isOpen) return null;

  // Unified Save with Conflict Validation
  const processSaveAttempt = async (dataToSave: Partial<Aula>, force: boolean = false) => {
    if (!dataToSave.materia || !dataToSave.instrutor || !dataToSave.curso) return;

    let result;

    if (initialData) {
      // Update
      const fullData = { ...initialData, ...dataToSave } as Aula;
      result = await updateAula(fullData, force, propagateRoom);
    } else {
      // Create
      result = await addAula(dataToSave as Omit<Aula, 'id' | 'tenantId'>, force);
    }

    if (result.warning && result.conflicts) {
      setConflictModal({
        isOpen: true,
        type: result.warning,
        conflicts: result.conflicts,
        pendingData: dataToSave
      });
      return;
    }

    if (result.success) {
      onClose();
    }
  };

  // Forçar criação/edição após confirmação de conflito
  const handleForceProceed = async () => {
    if (conflictModal.pendingData) {
      setConflictModal({ isOpen: false, type: null, conflicts: [], pendingData: null });
      await processSaveAttempt(conflictModal.pendingData, true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    // Check for critical status changes
    if (formData.status === 'concluida' && initialData?.status !== 'concluida') {
      setConfirmModal({
        isOpen: true,
        title: 'Confirmar conclusão',
        description: 'Tem certeza que deseja marcar esta aula como concluída? Esta ação consolida os registros.',
        action: () => processSaveAttempt(formData)
      });
      return;
    }

    if (formData.status === 'cancelada' && initialData?.status !== 'cancelada') {
      // Double check on UI layer to prevent bypass
      if (!isAdmin) return;

      setConfirmModal({
        isOpen: true,
        title: 'Confirmar cancelamento de aula',
        description: 'Tem certeza que deseja cancelar esta aula? Esta ação não poderá ser desfeita.',
        action: () => processSaveAttempt(formData)
      });
      return;
    }

    processSaveAttempt(formData);
  };

  // Specifically for "Cancelar Aula" button (Sets status to cancelled)
  const handleCancelClass = () => {
    // Double check permission
    if (!isAdmin) return;

    if (initialData) {
      setConfirmModal({
        isOpen: true,
        title: 'Confirmar cancelamento de aula',
        description: 'Tem certeza que deseja cancelar esta aula? Esta ação não poderá ser desfeita.',
        action: () => {
          processSaveAttempt({ ...initialData, status: 'cancelada' });
          onClose();
        }
      });
    }
  };

  const handleChange = (field: keyof Aula, value: any) => {
    // CORRECTION: Allow editing if it's a concluded class (unless viewer)
    // isReadOnly is true for concluded, so we must explicitly allow concluded.
    if (isViewer || (isReadOnly && !isConcluded)) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCursoChange = (nomeCurso: string) => {
    if (isReadOnly) return; // Course change strictly disabled for concluded/cancelled
    const selectedCurso = cursos.find(c => c.nome === nomeCurso);
    setFormData(prev => ({
      ...prev,
      curso: nomeCurso,
      materia: '',
      cor: selectedCurso ? selectedCurso.cor : prev.cor,
      numeroCurso: selectedCurso?.numeroCurso || '',
      numeroTurma: selectedCurso?.numeroCurso || '' // Auto-fill cohort with course number
    }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return; // Date change strictly disabled for concluded/cancelled
    const val = e.target.value;
    if (!val) return;
    const [y, m, d] = val.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    handleChange('data', localDate);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 dark:bg-slate-800 dark:border dark:border-slate-700">
          <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                {isReadOnly ? 'Detalhes da Aula' : (initialData ? 'Editar Aula' : 'Nova Aula')}
              </h2>
              {isViewer && (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                  <Lock size={12} />
                  Apenas Leitura
                </span>
              )}
              {!isViewer && isFinalState && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full border border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600">
                  <Lock size={12} />
                  Finalizada
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isActionLoading}
              className="text-gray-400 hover:text-gray-600 transition-colors dark:hover:text-gray-200 disabled:opacity-30"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Curso *</label>
                <select
                  required
                  disabled={isReadOnly || isActionLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                  value={formData.curso || ''}
                  onChange={(e) => handleCursoChange(e.target.value)}
                >
                  <option value="" disabled>Selecione um curso...</option>
                  {cursos.map(c => (
                    <option key={c.id} value={c.nome}>
                      {c.numeroCurso ? `${c.numeroCurso} - ` : ''}{c.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* SEARCH BY NUMBER FIELD */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 dark:bg-slate-700/50 dark:border-slate-600">
                <label className="block text-sm font-semibold text-blue-800 mb-1 dark:text-blue-300">
                  Buscar por Número
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Digite o número do curso..."
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    disabled={isReadOnly || isActionLoading}
                    list="course-numbers-list"
                    onChange={(e) => {
                      const val = e.target.value;
                      // Try to find exact match
                      const found = cursos.find(c => c.numeroCurso === val || (c.numeroCurso && val && c.numeroCurso.startsWith(val)));

                      // If exact match on number, auto-select
                      const exact = cursos.find(c => c.numeroCurso === val);
                      if (exact) {
                        handleCursoChange(exact.nome);
                        // Log selection
                        import('../services').then(({ auditService }) => {
                          auditService.log({
                            action: 'COURSE_SELECTED_BY_NUMBER',
                            entity: 'ui_interaction',
                            details: {
                              type: 'COURSE_SEARCH',
                              numero_curso: val,
                              course_id: exact.id,
                              target_course: exact.nome // Adding nome to details since 'target' property is not available
                            },
                            result: 'success'
                          });
                        });
                      }
                    }}
                  />
                  <datalist id="course-numbers-list">
                    {cursos.filter(c => c.numeroCurso).map(c => (
                      <option key={c.id} value={c.numeroCurso}>
                        {c.nome} ({c.status})
                      </option>
                    ))}
                  </datalist>
                  <Search className="absolute right-3 top-3 text-blue-400" size={16} />
                </div>
                <p className="text-xs text-blue-600 mt-1 dark:text-blue-400">
                  Digite o número para selecionar automaticamente.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Número do Curso (Confirmado)</label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Número do Curso (Confirmado)</label>
                  <input
                    type="text"
                    disabled={isReadOnly || isActionLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                    value={formData.numeroTurma || ''}
                    onChange={(e) => handleChange('numeroTurma', e.target.value)}
                    placeholder={formData.numeroCurso || 'Número da turma'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Matéria *</label>
                <select
                  required
                  disabled={!formData.curso || isReadOnly || isActionLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                  value={formData.materia || ''}
                  onChange={(e) => handleChange('materia', e.target.value)}
                >
                  <option value="" disabled>
                    {formData.curso ? 'Selecione uma matéria...' : 'Selecione um curso primeiro'}
                  </option>
                  {filteredMaterias.map(m => (
                    <option key={m.id} value={m.nome}>{m.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Instrutor *</label>
                  {formData.instrutor && <Avatar name={formData.instrutor} size="xs" />}
                </div>
                <select
                  required
                  disabled={isLocked || isActionLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                  value={formData.instrutor || ''}
                  onChange={(e) => handleChange('instrutor', e.target.value)}
                >
                  <option value="" disabled>Selecione...</option>
                  {instrutores.map(i => (
                    <option key={i.id} value={i.nome}>{i.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Sala</label>
                <div className="space-y-2">
                  <input
                    type="text"
                    disabled={isReadOnly || isActionLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                    value={formData.sala || ''}
                    onChange={(e) => handleChange('sala', e.target.value)}
                  />

                  {initialData && formData.sala !== (initialData.sala || '') && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30 animate-in fade-in slide-in-from-top-1">
                      <input
                        type="checkbox"
                        id="propagateRoom"
                        checked={propagateRoom}
                        onChange={(e) => setPropagateRoom(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="propagateRoom" className="text-xs text-blue-700 dark:text-blue-300 font-medium cursor-pointer">
                        Atualizar para todas as aulas desta turma
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Data</label>
                <input
                  type="date"
                  required
                  disabled={isReadOnly || isActionLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                  value={formData.data ? format(parseLocalDate(formData.data), 'yyyy-MM-dd') : ''}
                  onChange={handleDateChange}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Início</label>
                  <input
                    type="time"
                    required
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-gray-50 disabled:text-gray-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                    value={formData.horarioInicio || ''}
                    onChange={(e) => handleChange('horarioInicio', e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Fim</label>
                  <input
                    type="time"
                    required
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-gray-50 disabled:text-gray-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                    value={formData.horarioFim || ''}
                    onChange={(e) => handleChange('horarioFim', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Status</label>
                <select
                  disabled={isReadOnly || isActionLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                >
                  <option value="agendada">Agendada</option>
                  <option value="em-andamento">Em Andamento</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada" disabled={!isAdmin}>Cancelada {isAdmin ? '' : '(Admin)'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Observações</label>
              <textarea
                disabled={isLocked || isActionLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:disabled:bg-slate-800"
                rows={3}
                value={formData.observacoes || ''}
                onChange={(e) => handleChange('observacoes', e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6 dark:border-slate-700 min-h-[50px]">
              {/* Action Buttons Area */}
              <div className="flex-1 flex gap-2">
                {canCancel && (
                  <button
                    type="button"
                    onClick={handleCancelClass}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                    title="Cancela a aula mantendo o histórico"
                  >
                    <Ban size={16} />
                    Cancelar
                  </button>
                )}

                {isAdmin && initialData && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Excluir Aula Permanentemente',
                        description: 'ATENÇÃO: Esta ação removerá a aula do banco de dados definitivamente. Use para limpar registros de teste. Para manter histórico, use "Cancelar". Deseja continuar?',
                        action: async () => {
                          const success = await deleteAula(initialData.id);
                          if (success) onClose();
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                    title="Remove a aula do banco de dados"
                  >
                    <Trash2 size={16} />
                    Excluir
                  </button>
                )}

                {/* Information for Editors */}
                {initialData && isEditor && !isFinalState && (
                  <span className="text-xs text-gray-400 flex items-center gap-1 self-center ml-2">
                    <Info size={12} />
                    Edição permitida
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {canSave ? 'Cancelar' : 'Fechar'}
                </button>

                {canSave && (
                  <button
                    type="submit"
                    disabled={isActionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isActionLoading && <Loader2 size={16} className="animate-spin" />}
                    {isActionLoading ? 'Salvando...' : 'Salvar Aula'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Modal Layer */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.action}
        variant="danger"
      />

      {/* Conflict Modal */}
      {
        conflictModal.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 dark:bg-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  {conflictModal.type === 'ROOM_CONFLICT' ? 'Conflito de Sala' : 'Conflito de Horário'}
                </h3>
              </div>

              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {conflictModal.type === 'ROOM_CONFLICT'
                  ? <>A sala <strong>{conflictModal.pendingData?.sala}</strong> já está ocupada neste horário:</>
                  : <>O instrutor <strong>{conflictModal.pendingData?.instrutor}</strong> já possui aulas no mesmo horário:</>
                }
              </p>

              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 mb-4 space-y-2 max-h-40 overflow-y-auto">
                {conflictModal.conflicts.map((conflict, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-800 dark:text-white">{conflict.materia}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {conflict.horarioInicio} - {conflict.horarioFim}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Deseja prosseguir mesmo assim?
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConflictModal({ isOpen: false, type: null, conflicts: [], pendingData: null })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleForceProceed}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition shadow-sm"
                >
                  Prosseguir Mesmo Assim
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
};