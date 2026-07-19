import type { SyncEntityType } from "@businessbox/contracts";
import type {
  AiUsageRecord,
  AiUsageRepository,
  AuditLogRecord,
  AuditRepository,
  DeviceRecord,
  DeviceRepository,
  OrganizationMemberRecord,
  OrganizationRecord,
  OrganizationRepository,
  RefreshTokenRecord,
  RefreshTokenRepository,
  Repositories,
  SyncConflictRecord,
  SyncRepository,
  SyncedEntityRecord,
  UserRecord,
  UserRepository,
} from "./types.js";

/**
 * Implementazione in-memory delle repository: usata dai test e come fallback
 * di sviluppo quando `DATABASE_URL` non è configurata. La stessa logica di
 * dominio (auth, sync, tenancy) gira identica sull'adapter PostgreSQL.
 */
class MemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();

  findByEmail(email: string): Promise<UserRecord | null> {
    const lower = email.toLowerCase();
    for (const user of this.byId.values()) {
      if (user.email.toLowerCase() === lower) {
        return Promise.resolve(user);
      }
    }
    return Promise.resolve(null);
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  create(user: UserRecord): Promise<void> {
    this.byId.set(user.id, { ...user });
    return Promise.resolve();
  }

  updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
    }
    return Promise.resolve();
  }

  list(limit: number, offset: number): Promise<UserRecord[]> {
    return Promise.resolve([...this.byId.values()].slice(offset, offset + limit));
  }
}

class MemoryOrganizationRepository implements OrganizationRepository {
  private readonly orgs = new Map<string, OrganizationRecord>();
  private readonly members: OrganizationMemberRecord[] = [];

  create(org: OrganizationRecord): Promise<void> {
    this.orgs.set(org.id, { ...org });
    return Promise.resolve();
  }

  findById(id: string): Promise<OrganizationRecord | null> {
    return Promise.resolve(this.orgs.get(id) ?? null);
  }

  addMember(member: OrganizationMemberRecord): Promise<void> {
    this.members.push({ ...member });
    return Promise.resolve();
  }

  isMember(organizationId: string, userId: string): Promise<boolean> {
    return Promise.resolve(
      this.members.some((m) => m.organizationId === organizationId && m.userId === userId),
    );
  }

  listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    return Promise.resolve(this.members.filter((m) => m.organizationId === organizationId));
  }

  listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    const ids = new Set(
      this.members.filter((m) => m.userId === userId).map((m) => m.organizationId),
    );
    return Promise.resolve([...this.orgs.values()].filter((o) => ids.has(o.id)));
  }

  list(limit: number, offset: number): Promise<OrganizationRecord[]> {
    return Promise.resolve([...this.orgs.values()].slice(offset, offset + limit));
  }
}

class MemoryDeviceRepository implements DeviceRepository {
  private readonly byId = new Map<string, DeviceRecord>();

  create(device: DeviceRecord): Promise<void> {
    this.byId.set(device.id, { ...device });
    return Promise.resolve();
  }

  findById(id: string): Promise<DeviceRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  listForUser(userId: string): Promise<DeviceRecord[]> {
    return Promise.resolve([...this.byId.values()].filter((d) => d.userId === userId));
  }

  touch(id: string, lastSeenAt: string): Promise<void> {
    const device = this.byId.get(id);
    if (device) {
      device.lastSeenAt = lastSeenAt;
    }
    return Promise.resolve();
  }

  revoke(id: string, userId: string): Promise<boolean> {
    const device = this.byId.get(id);
    if (!device || device.userId !== userId) {
      return Promise.resolve(false);
    }
    device.revoked = true;
    return Promise.resolve(true);
  }
}

class MemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly byId = new Map<string, RefreshTokenRecord>();

  create(token: RefreshTokenRecord): Promise<void> {
    this.byId.set(token.id, { ...token });
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.byId.values()) {
      if (token.tokenHash === tokenHash) {
        return Promise.resolve(token);
      }
    }
    return Promise.resolve(null);
  }

  markRotated(id: string, rotatedTo: string): Promise<void> {
    const token = this.byId.get(id);
    if (token) {
      token.rotatedTo = rotatedTo;
    }
    return Promise.resolve();
  }

  revoke(id: string): Promise<void> {
    const token = this.byId.get(id);
    if (token) {
      token.revoked = true;
    }
    return Promise.resolve();
  }

  revokeAllForDevice(deviceId: string): Promise<void> {
    for (const token of this.byId.values()) {
      if (token.deviceId === deviceId) {
        token.revoked = true;
      }
    }
    return Promise.resolve();
  }

  revokeAllForUser(userId: string): Promise<void> {
    for (const token of this.byId.values()) {
      if (token.userId === userId) {
        token.revoked = true;
      }
    }
    return Promise.resolve();
  }
}

class MemorySyncRepository implements SyncRepository {
  private readonly entities = new Map<string, SyncedEntityRecord>();
  private readonly versions = new Map<string, number>();
  private readonly conflicts: SyncConflictRecord[] = [];
  private readonly idempotency = new Map<string, { status: string; newVersion?: number }>();

  private key(org: string, type: SyncEntityType, id: string): string {
    return `${org}:${type}:${id}`;
  }

  getEntity(
    organizationId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncedEntityRecord | null> {
    return Promise.resolve(
      this.entities.get(this.key(organizationId, entityType, entityId)) ?? null,
    );
  }

  saveEntity(entity: SyncedEntityRecord): Promise<void> {
    this.entities.set(this.key(entity.organizationId, entity.entityType, entity.entityId), {
      ...entity,
    });
    return Promise.resolve();
  }

  nextServerVersion(organizationId: string): Promise<number> {
    const next = (this.versions.get(organizationId) ?? 0) + 1;
    this.versions.set(organizationId, next);
    return Promise.resolve(next);
  }

  currentServerVersion(organizationId: string): Promise<number> {
    return Promise.resolve(this.versions.get(organizationId) ?? 0);
  }

  pullSince(organizationId: string, since: number, limit: number): Promise<SyncedEntityRecord[]> {
    return Promise.resolve(
      [...this.entities.values()]
        .filter((e) => e.organizationId === organizationId && e.serverVersion > since)
        .sort((a, b) => a.serverVersion - b.serverVersion)
        .slice(0, limit),
    );
  }

  recordConflict(conflict: SyncConflictRecord): Promise<void> {
    this.conflicts.push({ ...conflict });
    return Promise.resolve();
  }

  listConflicts(organizationId: string): Promise<SyncConflictRecord[]> {
    return Promise.resolve(this.conflicts.filter((c) => c.organizationId === organizationId));
  }

  getIdempotentResult(
    organizationId: string,
    key: string,
  ): Promise<{ status: string; newVersion?: number } | null> {
    return Promise.resolve(this.idempotency.get(`${organizationId}:${key}`) ?? null);
  }

  storeIdempotentResult(
    organizationId: string,
    key: string,
    result: { status: string; newVersion?: number },
  ): Promise<void> {
    this.idempotency.set(`${organizationId}:${key}`, result);
    return Promise.resolve();
  }
}

class MemoryAuditRepository implements AuditRepository {
  private readonly records: AuditLogRecord[] = [];

  append(record: AuditLogRecord): Promise<void> {
    this.records.push({ ...record });
    return Promise.resolve();
  }

  list(limit: number, offset: number): Promise<AuditLogRecord[]> {
    return Promise.resolve([...this.records].reverse().slice(offset, offset + limit));
  }
}

class MemoryAiUsageRepository implements AiUsageRepository {
  private readonly records: AiUsageRecord[] = [];

  add(record: AiUsageRecord): Promise<void> {
    this.records.push({ ...record });
    return Promise.resolve();
  }

  summary(limit: number): Promise<AiUsageRecord[]> {
    return Promise.resolve(this.records.slice(0, limit));
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    users: new MemoryUserRepository(),
    organizations: new MemoryOrganizationRepository(),
    devices: new MemoryDeviceRepository(),
    refreshTokens: new MemoryRefreshTokenRepository(),
    sync: new MemorySyncRepository(),
    audit: new MemoryAuditRepository(),
    aiUsage: new MemoryAiUsageRepository(),
    ping: () => Promise.resolve(true),
  };
}
