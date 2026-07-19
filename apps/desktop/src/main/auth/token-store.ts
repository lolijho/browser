import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/**
 * Backend di cifratura (in produzione: Electron `safeStorage`, legato al
 * keychain del sistema). Iniettabile per i test.
 */
export interface SecureCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * Store dei token del desktop (prompt 06):
 * - access token SOLO in memoria (mai su disco, mai in localStorage);
 * - refresh token cifrato con safeStorage e persistito su file;
 * - logout: cancellazione sicura del file e azzeramento in memoria.
 */
export class AuthTokenStore {
  private accessToken: string | null = null;
  private accessTokenExpiresAt: number | null = null;

  constructor(
    private readonly crypto: SecureCrypto,
    private readonly refreshTokenPath: string,
  ) {}

  setAccessToken(token: string, expiresAtIso: string): void {
    this.accessToken = token;
    this.accessTokenExpiresAt = Date.parse(expiresAtIso);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAccessTokenExpired(nowMs: number): boolean {
    return this.accessTokenExpiresAt === null || this.accessTokenExpiresAt <= nowMs;
  }

  /** Persiste il refresh token cifrato. Se la cifratura non è disponibile, NON scrive in chiaro. */
  saveRefreshToken(token: string): boolean {
    if (!this.crypto.isEncryptionAvailable()) {
      return false;
    }
    writeFileSync(this.refreshTokenPath, this.crypto.encryptString(token));
    return true;
  }

  loadRefreshToken(): string | null {
    if (!existsSync(this.refreshTokenPath) || !this.crypto.isEncryptionAvailable()) {
      return null;
    }
    try {
      return this.crypto.decryptString(readFileSync(this.refreshTokenPath));
    } catch {
      // File corrotto o chiave cambiata: trattato come "nessun token".
      return null;
    }
  }

  hasPersistedSession(): boolean {
    return existsSync(this.refreshTokenPath);
  }

  /** Logout: azzeramento in memoria + rimozione del file cifrato. */
  clear(): void {
    this.accessToken = null;
    this.accessTokenExpiresAt = null;
    if (existsSync(this.refreshTokenPath)) {
      rmSync(this.refreshTokenPath);
    }
  }
}
