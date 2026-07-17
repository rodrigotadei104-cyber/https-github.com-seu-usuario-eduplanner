import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Aula } from '../types';
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
  const { instrutores, cursos, materias, appSettings, currentDate, userProfile, addAula, updateAula, deleteAula, deleteAulasTurma, isActionLoading } = useSchedule();

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
    aulaExtra: false,
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
          numeroTurma: initialData.numeroTurma || initialData.numeroCurso || '',
          aulaExtra: initialData.aulaExtra || false
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
          numeroTurma: defaultCurso?.numeroCurso || '',
          aulaExtra: false
        });
      }
    }
  }, [isOpen, initialData, instrutores, cursos, appSettings.defaultClassDuration, currentDate]);;

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
                {isReadOnly ? 'Detalhes da Aula' : (initialData ? 'Editar Aula' : 'Nova Aula Avulsa')}
              </h2>
              {isViewer && (
                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 uppercase tracking-widest">
                  Apenas Leitura
                </span>
              )}
              {!isViewer && isFinalState && (
                <span className="text-[10px] font-black text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600 uppercase tracking-widest">
                  Finalizada
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isActionLoading}
              className="text-[10px] font-black text-gray-400 hover:text-black uppercase tracking-widest transition-colors dark:hover:text-gray-200 disabled:opacity-30"
            >
              Fechar [X]
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
                  {/* Curso da aula que não está na lista legada (ex.: gerado pelo Agente Criador via Catálogo).
                      Sem isto, o select cairia na 1ª opção e mostraria o curso errado. */}
                  {formData.curso && !cursos.some(c => c.nome === formData.curso) && (
                    <option value={formData.curso}>{formData.curso}</option>
                  )}
                </select>
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
                  {/* Matéria da aula que não está na lista filtrada (curso do Catálogo novo). */}
                  {formData.materia && !filteredMaterias.some(m => m.nome === formData.materia) && (
                    <option value={formData.materia}>{formData.materia}</option>
                  )}
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
 
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900/30 md:col-span-2">
                <input
                  type="checkbox"
                  id="aulaExtra"
                  disabled={isReadOnly || isActionLoading}
                  checked={formData.aulaExtra || false}
                  onChange={(e) => handleChange('aulaExtra', e.target.checked)}
                  className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 disabled:opacity-50"
                />
                <div className="flex flex-col">
                  <label htmlFor="aulaExtra" className="text-sm font-bold text-amber-800 dark:text-amber-400 cursor-pointer flex items-center gap-1">
                    <span>⚡ Aula Extra</span>
                  </label>
                  <span className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                    Permite criar ou editar esta aula desconsiderando o limite de carga horária planejada da matéria.
                  </span>
                </div>
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



            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-5 border-t border-slate-100 mt-6 dark:border-slate-700 gap-4 min-h-[60px]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-5 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-all duration-200 flex items-center justify-center"
                >
                  {canSave ? 'Cancelar' : 'Fechar'}
                </button>

                {initialData && canSave && (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                    
                    {canCancel && (
                      <button
                        type="button"
                        onClick={handleCancelClass}
                        className="h-10 px-3 text-xs font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 rounded-lg transition-colors flex items-center gap-1.5"
                        title="Cancela a aula mantendo o histórico"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <span className="hidden sm:inline">Suspender</span>
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: 'Excluir Aula Permanentemente',
                            description: 'ATENÇÃO: Esta ação removerá a aula do banco de dados definitivamente. Use para limpar registros de teste. Para manter histórico, use "Suspender". Deseja continuar?',
                            action: async () => {
                              const success = await deleteAula(initialData.id);
                              if (success) onClose();
                            }
                          });
                        }}
                        className="h-10 px-3 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 rounded-lg transition-colors flex items-center gap-1.5"
                        title="Remove a aula do banco de dados"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                    )}

                    {isAdmin && initialData.tipoAula !== 'PROGRAMA' && (
                      <button
                        type="button"
                        onClick={() => {
                          const cursoNome = initialData.curso || 'este curso';
                          const turmaNome = initialData.numeroTurma ? `Turma #${initialData.numeroTurma}` : 'esta turma';
                          
                          const selectedCursoObj = cursos.find(c => c.nome === (formData.curso || initialData?.curso));
                          const targetCursoId = initialData?.cursoId || (initialData as any)?.curso_id || selectedCursoObj?.id;

                          setConfirmModal({
                            isOpen: true,
                            title: 'Excluir Grade da Turma',
                            description: `ATENÇÃO: Esta ação removerá TODAS as aulas (passadas, presentes e futuras) da grade do curso "${cursoNome}" (${turmaNome}) definitivamente. Esta operação é irreversível. Deseja continuar?`,
                            action: async () => {
                              const success = await deleteAulasTurma(targetCursoId, initialData.numeroTurma || '', initialData.turmaId, initialData.curso || formData.curso || '');
                              if (success) onClose();
                            }
                          });
                        }}
                        className="h-10 px-3 text-xs font-medium text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:text-slate-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 rounded-lg transition-colors flex items-center gap-1.5"
                        title="Exclui todas as aulas desta turma"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="hidden sm:inline">Excluir Grade</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <div>
                {canSave && (
                  <button
                    type="submit"
                    disabled={isActionLoading}
                    className="h-10 px-6 text-[11px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all active:scale-[0.98] shadow-md shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isActionLoading ? (
                      <div className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Salvando...
                      </div>
                    ) : 'Gravar Aula'}
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
              <div className="px-2 py-1 bg-amber-600 text-white text-[10px] font-black rounded uppercase tracking-widest mb-4 inline-block">Atenção</div>
              <h3 className="text-lg font-black text-gray-800 dark:text-white uppercase tracking-tight mb-4">
                {conflictModal.type === 'ROOM_CONFLICT' ? 'Conflito de Sala' : 'Conflito de Instrutor'}
              </h3>

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
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition dark:bg-slate-800 dark:text-gray-300 dark:border-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleForceProceed}
                  className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition shadow-sm"
                >
                  Prosseguir
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
};