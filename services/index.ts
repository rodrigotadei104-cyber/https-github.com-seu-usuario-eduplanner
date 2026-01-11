// ============================================
// SERVICES INDEX
// Exportação centralizada de todos os serviços
// ============================================

export { authService } from './auth.service';
export type { LoginResult, UserProfile } from './auth.service';

export { tenantService } from './tenant.service';

export { permissionService } from './permission.service';
export type { UserRole, Action } from './permission.service';

export { auditService } from './audit.service';
export type { AuditAction, AuditEntry } from './audit.service';

export { userService } from './user.service';
export type { CreateUserInput } from './user.service';

export { aulaService } from './aula.service';
export type { AulaStatus, AulaInput, AulaUpdateInput, Metrics } from './aula.service';

export { instrutorService, cursoService, materiaService } from './registration.service';
export type { InstrutorInput, CursoInput, MateriaInput, ServiceResult } from './registration.service';

export { eventService } from './event.service';
export type { EventInput } from './event.service';

