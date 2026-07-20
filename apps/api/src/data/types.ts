import type { SyncEntityType, SyncOperation } from "@businessbox/contracts";

// --- record di dominio (rappresentazione server-side) ---

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  planId: string | null;
  createdAt: string;
}

export interface OrganizationMemberRecord {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
}

/** Refresh token conservato come hash (mai in chiaro). Rotazione: un token usato è consumato. */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  deviceId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  /** id del token che ha sostituito questo (catena di rotazione); null se attivo. */
  rotatedTo: string | null;
  revoked: boolean;
}

/** Entità sincronizzata lato server con versione monotona globale per tenant. */
export interface SyncedEntityRecord {
  organizationId: string;
  entityType: SyncEntityType;
  entityId: string;
  payload: Record<string, unknown> | null;
  version: number;
  /** Ultima serverVersion (cursore globale del tenant) associata a questa entità. */
  serverVersion: number;
  operation: SyncOperation;
  updatedAt: string;
  deleted: boolean;
}

export interface SyncConflictRecord {
  id: string;
  organizationId: string;
  entityType: SyncEntityType;
  entityId: string;
  localPayload: Record<string, unknown> | null;
  remotePayload: Record<string, unknown> | null;
  detectedAt: string;
}

export interface AiUsageRecord {
  organizationId: string;
  userId: string;
  day: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

// --- interfacce repository (implementate in-memory e su Postgres) ---

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  list(limit: number, offset: number): Promise<UserRecord[]>;
}

export interface OrganizationRepository {
  create(org: OrganizationRecord): Promise<void>;
  findById(id: string): Promise<OrganizationRecord | null>;
  addMember(member: OrganizationMemberRecord): Promise<void>;
  /** Verifica di appartenenza server-side: cuore della difesa multi-tenant/IDOR. */
  isMember(organizationId: string, userId: string): Promise<boolean>;
  listMembers(organizationId: string): Promise<OrganizationMemberRecord[]>;
  listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]>;
  list(limit: number, offset: number): Promise<OrganizationRecord[]>;
}

export interface DeviceRepository {
  create(device: DeviceRecord): Promise<void>;
  findById(id: string): Promise<DeviceRecord | null>;
  listForUser(userId: string): Promise<DeviceRecord[]>;
  touch(id: string, lastSeenAt: string): Promise<void>;
  revoke(id: string, userId: string): Promise<boolean>;
}

export interface RefreshTokenRepository {
  create(token: RefreshTokenRecord): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markRotated(id: string, rotatedTo: string): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAllForDevice(deviceId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface SyncRepository {
  /** Applica una mutazione in transazione; ritorna esito e nuova versione/conflitto. */
  getEntity(
    organizationId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncedEntityRecord | null>;
  saveEntity(entity: SyncedEntityRecord): Promise<void>;
  nextServerVersion(organizationId: string): Promise<number>;
  currentServerVersion(organizationId: string): Promise<number>;
  pullSince(organizationId: string, since: number, limit: number): Promise<SyncedEntityRecord[]>;
  recordConflict(conflict: SyncConflictRecord): Promise<void>;
  listConflicts(organizationId: string): Promise<SyncConflictRecord[]>;
  /** Idempotenza: esito già registrato per la chiave, o null se mai vista. */
  getIdempotentResult(
    organizationId: string,
    key: string,
  ): Promise<{ status: string; newVersion?: number } | null>;
  storeIdempotentResult(
    organizationId: string,
    key: string,
    result: { status: string; newVersion?: number },
  ): Promise<void>;
}

export interface AuditRepository {
  append(record: AuditLogRecord): Promise<void>;
  list(limit: number, offset: number): Promise<AuditLogRecord[]>;
}

export interface AiUsageRepository {
  add(record: AiUsageRecord): Promise<void>;
  summary(limit: number): Promise<AiUsageRecord[]>;
}

export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  devices: DeviceRepository;
  refreshTokens: RefreshTokenRepository;
  sync: SyncRepository;
  audit: AuditRepository;
  aiUsage: AiUsageRepository;
  /** Health del datastore sottostante. */
  ping(): Promise<boolean>;
}
