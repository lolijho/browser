import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
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
} from "../types.js";

const { Pool } = pg;
type Pool = InstanceType<typeof pg.Pool>;

/**
 * Migrazione idempotente con advisory lock: più repliche possono avviarsi
 * insieme senza applicare lo schema in parallelo (prompt 06/08).
 */
export async function migrate(pool: Pool): Promise<void> {
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BUSINESSBOX_MIGRATION_LOCK]);
    await client.query(schema);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [BUSINESSBOX_MIGRATION_LOCK]);
    client.release();
  }
}

const BUSINESSBOX_MIGRATION_LOCK = 774411;

class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [
      email,
    ]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async create(user: UserRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES ($1,$2,$3,$4,$5)",
      [user.id, user.email, user.passwordHash, user.emailVerified, user.createdAt],
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      userId,
      passwordHash,
    ]);
  }

  async list(limit: number, offset: number): Promise<UserRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM users ORDER BY created_at LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    return rows.map(mapUser);
  }
}

class PgOrganizationRepository implements OrganizationRepository {
  constructor(private readonly pool: Pool) {}

  async create(org: OrganizationRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO organizations (id, name, plan_id, created_at) VALUES ($1,$2,$3,$4)",
      [org.id, org.name, org.planId, org.createdAt],
    );
  }

  async findById(id: string): Promise<OrganizationRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM organizations WHERE id = $1", [id]);
    return rows[0] ? mapOrg(rows[0]) : null;
  }

  async addMember(member: OrganizationMemberRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, created_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [member.organizationId, member.userId, member.role, member.createdAt],
    );
  }

  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM organization_members WHERE organization_id = $1",
      [organizationId],
    );
    return rows.map(mapMember);
  }

  async listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT o.* FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = $1 ORDER BY o.created_at`,
      [userId],
    );
    return rows.map(mapOrg);
  }

  async list(limit: number, offset: number): Promise<OrganizationRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM organizations ORDER BY created_at LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    return rows.map(mapOrg);
  }
}

class PgDeviceRepository implements DeviceRepository {
  constructor(private readonly pool: Pool) {}

  async create(device: DeviceRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO devices (id, user_id, name, created_at, last_seen_at, revoked)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [device.id, device.userId, device.name, device.createdAt, device.lastSeenAt, device.revoked],
    );
  }

  async findById(id: string): Promise<DeviceRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM devices WHERE id = $1", [id]);
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async listForUser(userId: string): Promise<DeviceRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at",
      [userId],
    );
    return rows.map(mapDevice);
  }

  async touch(id: string, lastSeenAt: string): Promise<void> {
    await this.pool.query("UPDATE devices SET last_seen_at = $2 WHERE id = $1", [id, lastSeenAt]);
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "UPDATE devices SET revoked = TRUE WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}

class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async create(token: RefreshTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens
       (id, user_id, device_id, organization_id, token_hash, expires_at, created_at, rotated_to, revoked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        token.id,
        token.userId,
        token.deviceId,
        token.organizationId,
        token.tokenHash,
        token.expiresAt,
        token.createdAt,
        token.rotatedTo,
        token.revoked,
      ],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM refresh_tokens WHERE token_hash = $1", [
      tokenHash,
    ]);
    return rows[0] ? mapRefresh(rows[0]) : null;
  }

  async markRotated(id: string, rotatedTo: string): Promise<void> {
    await this.pool.query("UPDATE refresh_tokens SET rotated_to = $2 WHERE id = $1", [
      id,
      rotatedTo === "rotated" ? null : rotatedTo,
    ]);
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [id]);
  }

  async revokeAllForDevice(deviceId: string): Promise<void> {
    await this.pool.query("UPDATE refresh_tokens SET revoked = TRUE WHERE device_id = $1", [
      deviceId,
    ]);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", [userId]);
  }
}

class PgSyncRepository implements SyncRepository {
  constructor(private readonly pool: Pool) {}

  async getEntity(
    organizationId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncedEntityRecord | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM synced_entities WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3",
      [organizationId, entityType, entityId],
    );
    return rows[0] ? mapEntity(rows[0]) : null;
  }

  async saveEntity(entity: SyncedEntityRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO synced_entities
       (organization_id, entity_type, entity_id, payload, version, server_version, operation, updated_at, deleted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (organization_id, entity_type, entity_id) DO UPDATE SET
         payload = EXCLUDED.payload, version = EXCLUDED.version,
         server_version = EXCLUDED.server_version, operation = EXCLUDED.operation,
         updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted`,
      [
        entity.organizationId,
        entity.entityType,
        entity.entityId,
        entity.payload,
        entity.version,
        entity.serverVersion,
        entity.operation,
        entity.updatedAt,
        entity.deleted,
      ],
    );
  }

  async nextServerVersion(organizationId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO sync_cursors (organization_id, server_version) VALUES ($1, 1)
       ON CONFLICT (organization_id) DO UPDATE SET server_version = sync_cursors.server_version + 1
       RETURNING server_version`,
      [organizationId],
    );
    return Number(rows[0].server_version);
  }

  async currentServerVersion(organizationId: string): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT server_version FROM sync_cursors WHERE organization_id = $1",
      [organizationId],
    );
    return rows[0] ? Number(rows[0].server_version) : 0;
  }

  async pullSince(
    organizationId: string,
    since: number,
    limit: number,
  ): Promise<SyncedEntityRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM synced_entities WHERE organization_id = $1 AND server_version > $2
       ORDER BY server_version LIMIT $3`,
      [organizationId, since, limit],
    );
    return rows.map(mapEntity);
  }

  async recordConflict(conflict: SyncConflictRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_conflicts (id, organization_id, entity_type, entity_id, local_payload, remote_payload, detected_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        conflict.id,
        conflict.organizationId,
        conflict.entityType,
        conflict.entityId,
        conflict.localPayload,
        conflict.remotePayload,
        conflict.detectedAt,
      ],
    );
  }

  async listConflicts(organizationId: string): Promise<SyncConflictRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM sync_conflicts WHERE organization_id = $1 ORDER BY detected_at DESC",
      [organizationId],
    );
    return rows.map(mapConflict);
  }

  async getIdempotentResult(
    organizationId: string,
    key: string,
  ): Promise<{ status: string; newVersion?: number } | null> {
    const { rows } = await this.pool.query(
      "SELECT status, new_version FROM sync_idempotency WHERE organization_id = $1 AND key = $2",
      [organizationId, key],
    );
    if (!rows[0]) {
      return null;
    }
    return {
      status: String(rows[0].status),
      ...(rows[0].new_version !== null ? { newVersion: Number(rows[0].new_version) } : {}),
    };
  }

  async storeIdempotentResult(
    organizationId: string,
    key: string,
    result: { status: string; newVersion?: number },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_idempotency (organization_id, key, status, new_version)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id, key) DO UPDATE SET status = EXCLUDED.status, new_version = EXCLUDED.new_version`,
      [organizationId, key, result.status, result.newVersion ?? null],
    );
  }
}

class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async append(record: AuditLogRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (id, organization_id, actor_id, action, target_type, target_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        record.id,
        record.organizationId,
        record.actorId,
        record.action,
        record.targetType,
        record.targetId,
        record.createdAt,
      ],
    );
  }

  async list(limit: number, offset: number): Promise<AuditLogRecord[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    );
    return rows.map(mapAudit);
  }
}

class PgAiUsageRepository implements AiUsageRepository {
  constructor(private readonly pool: Pool) {}

  async add(record: AiUsageRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_usage (organization_id, user_id, day, input_tokens, output_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id, user_id, day) DO UPDATE SET
         input_tokens = ai_usage.input_tokens + EXCLUDED.input_tokens,
         output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens,
         cost_usd = ai_usage.cost_usd + EXCLUDED.cost_usd`,
      [
        record.organizationId,
        record.userId,
        record.day,
        record.inputTokens,
        record.outputTokens,
        record.costUsd,
      ],
    );
  }

  async summary(limit: number): Promise<AiUsageRecord[]> {
    const { rows } = await this.pool.query("SELECT * FROM ai_usage ORDER BY day DESC LIMIT $1", [
      limit,
    ]);
    return rows.map((r) => ({
      organizationId: String(r.organization_id),
      userId: String(r.user_id),
      day: String(r.day),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      costUsd: Number(r.cost_usd),
    }));
  }
}

export async function createPgRepositories(databaseUrl: string): Promise<Repositories> {
  const pool = new Pool({ connectionString: databaseUrl });
  await migrate(pool);
  return {
    users: new PgUserRepository(pool),
    organizations: new PgOrganizationRepository(pool),
    devices: new PgDeviceRepository(pool),
    refreshTokens: new PgRefreshTokenRepository(pool),
    sync: new PgSyncRepository(pool),
    audit: new PgAuditRepository(pool),
    aiUsage: new PgAiUsageRepository(pool),
    ping: async () => {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
  };
}

// --- mapper riga → record ---
type Row = Record<string, unknown>;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function mapUser(r: Row): UserRecord {
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    emailVerified: Boolean(r.email_verified),
    createdAt: iso(r.created_at),
  };
}
function mapOrg(r: Row): OrganizationRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    planId: r.plan_id === null ? null : String(r.plan_id),
    createdAt: iso(r.created_at),
  };
}
function mapMember(r: Row): OrganizationMemberRecord {
  return {
    organizationId: String(r.organization_id),
    userId: String(r.user_id),
    role: r.role as OrganizationMemberRecord["role"],
    createdAt: iso(r.created_at),
  };
}
function mapDevice(r: Row): DeviceRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name),
    createdAt: iso(r.created_at),
    lastSeenAt: iso(r.last_seen_at),
    revoked: Boolean(r.revoked),
  };
}
function mapRefresh(r: Row): RefreshTokenRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    deviceId: String(r.device_id),
    organizationId: String(r.organization_id),
    tokenHash: String(r.token_hash),
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
    rotatedTo: r.rotated_to === null ? null : String(r.rotated_to),
    revoked: Boolean(r.revoked),
  };
}
function mapEntity(r: Row): SyncedEntityRecord {
  return {
    organizationId: String(r.organization_id),
    entityType: r.entity_type as SyncEntityType,
    entityId: String(r.entity_id),
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    version: Number(r.version),
    serverVersion: Number(r.server_version),
    operation: r.operation as SyncedEntityRecord["operation"],
    updatedAt: iso(r.updated_at),
    deleted: Boolean(r.deleted),
  };
}
function mapConflict(r: Row): SyncConflictRecord {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    entityType: r.entity_type as SyncEntityType,
    entityId: String(r.entity_id),
    localPayload: (r.local_payload as Record<string, unknown> | null) ?? null,
    remotePayload: (r.remote_payload as Record<string, unknown> | null) ?? null,
    detectedAt: iso(r.detected_at),
  };
}
function mapAudit(r: Row): AuditLogRecord {
  return {
    id: String(r.id),
    organizationId: r.organization_id === null ? null : String(r.organization_id),
    actorId: r.actor_id === null ? null : String(r.actor_id),
    action: String(r.action),
    targetType: String(r.target_type),
    targetId: r.target_id === null ? null : String(r.target_id),
    createdAt: iso(r.created_at),
  };
}
