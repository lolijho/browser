import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { AuthSession, AuthTokens } from "@businessbox/contracts";
import type { Repositories } from "../../data/types.js";
import { generateRefreshToken, hashToken, signAccessToken, type TokenConfig } from "./tokens.js";

export class AuthError extends Error {
  constructor(
    public readonly code:
      "email_taken" | "invalid_credentials" | "invalid_refresh" | "refresh_reused" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthServiceDeps {
  repos: Repositories;
  tokenConfig: TokenConfig;
  now?: () => Date;
  newId?: () => string;
}

/**
 * Servizio di autenticazione (prompt 06): registrazione, login, refresh con
 * rotazione e rilevamento del riuso, logout, revoca dispositivo, reset password.
 * Password con Argon2id; refresh token conservati solo come hash.
 */
export class AuthService {
  private readonly repos: Repositories;
  private readonly tokenConfig: TokenConfig;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: AuthServiceDeps) {
    this.repos = deps.repos;
    this.tokenConfig = deps.tokenConfig;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => randomUUID());
  }

  async register(input: {
    email: string;
    password: string;
    organizationName?: string;
    deviceName?: string;
  }): Promise<AuthSession> {
    const existing = await this.repos.users.findByEmail(input.email);
    if (existing) {
      throw new AuthError("email_taken", "Email già registrata");
    }
    const now = this.now();
    const user = {
      id: this.newId(),
      email: input.email,
      passwordHash: await hash(input.password),
      emailVerified: false,
      createdAt: now.toISOString(),
    };
    await this.repos.users.create(user);

    const org = {
      id: this.newId(),
      name: input.organizationName ?? `${input.email}`,
      planId: null,
      createdAt: now.toISOString(),
    };
    await this.repos.organizations.create(org);
    await this.repos.organizations.addMember({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
      createdAt: now.toISOString(),
    });

    return this.startSession(user.id, user.email, false, org.id, input.deviceName ?? "Dispositivo");
  }

  async login(input: {
    email: string;
    password: string;
    deviceName?: string;
  }): Promise<AuthSession> {
    const user = await this.repos.users.findByEmail(input.email);
    // Verifica sempre un hash (anche se l'utente non esiste) per non rivelare
    // l'esistenza dell'account tramite timing.
    const ok = user
      ? await verify(user.passwordHash, input.password).catch(() => false)
      : await verify(DUMMY_HASH, input.password).catch(() => false);
    if (!user || !ok) {
      throw new AuthError("invalid_credentials", "Credenziali non valide");
    }
    const orgs = await this.repos.organizations.listOrganizationsForUser(user.id);
    const organizationId = orgs[0]?.id;
    if (!organizationId) {
      throw new AuthError("not_found", "Nessuna organizzazione per l'utente");
    }
    return this.startSession(
      user.id,
      user.email,
      user.emailVerified,
      organizationId,
      input.deviceName ?? "Dispositivo",
    );
  }

  /** Refresh con rotazione: il vecchio token è consumato; il riuso revoca la catena. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.repos.refreshTokens.findByHash(tokenHash);
    if (!record || record.revoked) {
      throw new AuthError("invalid_refresh", "Refresh token non valido");
    }
    // Riuso di un token già ruotato: possibile furto → revoca l'intera catena/dispositivo.
    if (record.rotatedTo !== null) {
      await this.repos.refreshTokens.revokeAllForDevice(record.deviceId);
      throw new AuthError("refresh_reused", "Refresh token già utilizzato: sessione revocata");
    }
    if (new Date(record.expiresAt).getTime() < this.now().getTime()) {
      throw new AuthError("invalid_refresh", "Refresh token scaduto");
    }
    const device = await this.repos.devices.findById(record.deviceId);
    if (!device || device.revoked) {
      throw new AuthError("invalid_refresh", "Dispositivo revocato");
    }

    const user = await this.repos.users.findById(record.userId);
    if (!user) {
      throw new AuthError("not_found", "Utente inesistente");
    }
    const now = this.now();
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
      record.organizationId,
      record.deviceId,
    );
    // Segna il vecchio come ruotato verso il nuovo (rilevamento riuso futuro).
    const newRecord = await this.repos.refreshTokens.findByHash(hashToken(tokens.refreshToken));
    await this.repos.refreshTokens.markRotated(record.id, newRecord?.id ?? "rotated");
    await this.repos.devices.touch(record.deviceId, now.toISOString());
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const record = await this.repos.refreshTokens.findByHash(hashToken(refreshToken));
    if (record) {
      await this.repos.refreshTokens.revoke(record.id);
    }
  }

  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    const revoked = await this.repos.devices.revoke(deviceId, userId);
    if (revoked) {
      await this.repos.refreshTokens.revokeAllForDevice(deviceId);
    }
    return revoked;
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hash(newPassword);
    await this.repos.users.updatePassword(userId, passwordHash);
    // Ogni refresh esistente viene invalidato dopo il reset.
    await this.repos.refreshTokens.revokeAllForUser(userId);
  }

  private async startSession(
    userId: string,
    email: string,
    emailVerified: boolean,
    organizationId: string,
    deviceName: string,
  ): Promise<AuthSession> {
    const now = this.now();
    const deviceId = this.newId();
    await this.repos.devices.create({
      id: deviceId,
      userId,
      name: deviceName,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      revoked: false,
    });
    const tokens = await this.issueTokens(userId, email, emailVerified, organizationId, deviceId);
    return {
      user: { id: userId, email, emailVerified },
      organizationId,
      deviceId,
      tokens,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    _emailVerified: boolean,
    organizationId: string,
    deviceId: string,
  ): Promise<AuthTokens> {
    const now = this.now();
    const access = await signAccessToken(
      { sub: userId, email, org: organizationId, device: deviceId },
      this.tokenConfig,
      now,
    );
    const refresh = generateRefreshToken(now, this.tokenConfig.refreshTtlSeconds);
    await this.repos.refreshTokens.create({
      id: this.newId(),
      userId,
      deviceId,
      organizationId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt.toISOString(),
      createdAt: now.toISOString(),
      rotatedTo: null,
      revoked: false,
    });
    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }
}

// Hash Argon2id fisso per il confronto a tempo costante quando l'utente non esiste.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
