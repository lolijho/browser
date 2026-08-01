import {
  authSessionSchema,
  authTokensSchema,
  type AuthStatus,
  type AuthTokens,
} from "@businessbox/contracts";
import type { AuthTokenStore } from "./token-store.js";

/** Margine di sicurezza: rinnova poco prima della scadenza reale. */
const REFRESH_SKEW_MS = 30_000;

export interface AuthManagerDeps {
  store: AuthTokenStore;
  apiBaseUrl: string;
  deviceName: string;
  /** Iniettabile per i test. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const SIGNED_OUT: AuthStatus = {
  authenticated: false,
  email: null,
  organizationId: null,
  offline: false,
};

/**
 * Autenticazione del desktop (prompt 06, lato client).
 *
 * Invariante di sicurezza: i token NON attraversano mai il bridge verso il
 * renderer. Restano qui; il renderer conosce solo `AuthStatus`. Di conseguenza
 * ogni chiamata autenticata (chat AI, sync) parte dal processo principale.
 */
export class AuthManager {
  private status: AuthStatus = { ...SIGNED_OUT };
  private listeners = new Set<(status: AuthStatus) => void>();
  /** Rinnovo in volo condiviso: evita refresh concorrenti sullo stesso token. */
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly deps: AuthManagerDeps) {}

  private get fetch(): typeof fetch {
    return this.deps.fetchImpl ?? globalThis.fetch;
  }

  private get now(): number {
    return (this.deps.now ?? Date.now)();
  }

  getStatus(): AuthStatus {
    return { ...this.status };
  }

  onChange(listener: (status: AuthStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(next: AuthStatus): AuthStatus {
    this.status = next;
    for (const listener of this.listeners) {
      listener({ ...next });
    }
    return { ...next };
  }

  private applySession(session: {
    user: { email: string };
    organizationId: string;
    tokens: AuthTokens;
  }): AuthStatus {
    this.deps.store.setAccessToken(session.tokens.accessToken, session.tokens.accessTokenExpiresAt);
    this.deps.store.saveRefreshToken(session.tokens.refreshToken);
    return this.setStatus({
      authenticated: true,
      email: session.user.email,
      organizationId: session.organizationId,
      offline: false,
    });
  }

  /** Ripristina la sessione dal refresh token persistito (avvio applicazione). */
  async restore(): Promise<AuthStatus> {
    if (!this.deps.store.hasPersistedSession()) {
      return this.setStatus({ ...SIGNED_OUT });
    }
    const token = await this.refreshAccessToken();
    if (token) {
      return this.getStatus();
    }
    return this.getStatus();
  }

  async register(email: string, password: string): Promise<AuthStatus> {
    return this.authenticate("register", { email, password, deviceName: this.deps.deviceName });
  }

  async login(email: string, password: string): Promise<AuthStatus> {
    return this.authenticate("login", { email, password, deviceName: this.deps.deviceName });
  }

  private async authenticate(kind: "login" | "register", body: unknown): Promise<AuthStatus> {
    const response = await this.fetch(`${this.deps.apiBaseUrl}/api/v1/auth/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await describeAuthError(response));
    }
    const session = authSessionSchema.parse(await response.json());
    return this.applySession(session);
  }

  /**
   * Access token valido, rinnovandolo se scaduto. `null` se non autenticato o
   * se il rinnovo fallisce (sessione chiusa o API irraggiungibile).
   */
  async getAccessToken(): Promise<string | null> {
    const current = this.deps.store.getAccessToken();
    if (current && !this.deps.store.isAccessTokenExpired(this.now + REFRESH_SKEW_MS)) {
      return current;
    }
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string | null> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = this.deps.store.loadRefreshToken();
    if (!refreshToken) {
      this.setStatus({ ...SIGNED_OUT });
      return null;
    }
    let response: Response;
    try {
      response = await this.fetch(`${this.deps.apiBaseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // API irraggiungibile: la sessione resta valida, segnaliamo offline.
      // Non cancelliamo il refresh token: il browser funziona offline.
      this.setStatus({ ...this.status, offline: true });
      return null;
    }
    if (!response.ok) {
      // Rifiuto esplicito del server: la sessione non è più valida.
      this.deps.store.clear();
      this.setStatus({ ...SIGNED_OUT });
      return null;
    }
    const tokens = authTokensSchema.parse(await response.json());
    this.deps.store.setAccessToken(tokens.accessToken, tokens.accessTokenExpiresAt);
    this.deps.store.saveRefreshToken(tokens.refreshToken);
    // Il refresh non riporta l'identità: manteniamo quella nota, uscendo da offline.
    this.setStatus({
      ...this.status,
      authenticated: true,
      offline: false,
    });
    return tokens.accessToken;
  }

  async logout(): Promise<AuthStatus> {
    const refreshToken = this.deps.store.loadRefreshToken();
    if (refreshToken) {
      try {
        await this.fetch(`${this.deps.apiBaseUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Logout locale comunque: i token vengono distrutti qui sotto.
      }
    }
    this.deps.store.clear();
    return this.setStatus({ ...SIGNED_OUT });
  }
}

/** Messaggi in italiano per gli errori di autenticazione noti dell'API. */
async function describeAuthError(response: Response): Promise<string> {
  let code: string;
  try {
    const body = (await response.json()) as { error?: unknown };
    code = typeof body.error === "string" ? body.error : "";
  } catch {
    code = "";
  }
  switch (code) {
    case "invalid_credentials":
      return "Email o password non corretti.";
    case "email_taken":
      return "Esiste già un account con questa email.";
    case "invalid_request":
      return "Dati non validi: controlla email e password (minimo 10 caratteri).";
    default:
      return `Autenticazione non riuscita (errore ${response.status}).`;
  }
}
