import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthManager } from "./auth-manager.js";
import { AuthTokenStore, type SecureCrypto } from "./token-store.js";

/** Cifratura finta ma con la stessa semantica di safeStorage. */
const fakeCrypto: SecureCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`),
  decryptString: (buf) => buf.toString().replace(/^enc:/, ""),
};

const dirs: string[] = [];
function newStore(): AuthTokenStore {
  const dir = mkdtempSync(join(tmpdir(), "bb-auth-"));
  dirs.push(dir);
  return new AuthTokenStore(fakeCrypto, join(dir, "auth.bin"));
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

function session(overrides: { accessToken?: string; expiresAt?: string } = {}) {
  return {
    user: { id: "u1", email: "utente@example.com", emailVerified: false },
    organizationId: "org-1",
    deviceId: "dev-1",
    tokens: {
      accessToken: overrides.accessToken ?? "access-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: overrides.expiresAt ?? "2100-01-01T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T00:00:00.000Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function build(fetchImpl: typeof fetch, store = newStore(), now = () => 0) {
  return new AuthManager({
    store,
    apiBaseUrl: "http://api.test",
    deviceName: "test",
    fetchImpl,
    now,
  });
}

describe("AuthManager", () => {
  it("il login popola lo stato e rende disponibile un access token", async () => {
    const manager = build(
      vi.fn().mockResolvedValue(jsonResponse(session())) as unknown as typeof fetch,
    );
    const status = await manager.login("utente@example.com", "password-lunga");
    expect(status).toMatchObject({
      authenticated: true,
      email: "utente@example.com",
      organizationId: "org-1",
    });
    await expect(manager.getAccessToken()).resolves.toBe("access-1");
  });

  it("lo stato esposto non contiene MAI i token", async () => {
    const manager = build(
      vi.fn().mockResolvedValue(jsonResponse(session())) as unknown as typeof fetch,
    );
    const status = await manager.login("utente@example.com", "password-lunga");
    // Invariante di sicurezza: il renderer riceve solo questo oggetto.
    expect(JSON.stringify(status)).not.toContain("access-1");
    expect(JSON.stringify(status)).not.toContain("refresh-1");
    expect(Object.keys(status).sort()).toEqual([
      "authenticated",
      "email",
      "offline",
      "organizationId",
    ]);
  });

  it("credenziali errate producono un messaggio leggibile, non un 401 grezzo", async () => {
    const manager = build(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "invalid_credentials" }, 401),
        ) as unknown as typeof fetch,
    );
    await expect(manager.login("a@example.com", "password-lunga")).rejects.toThrow(
      /Email o password non corretti/,
    );
    expect(manager.getStatus().authenticated).toBe(false);
  });

  it("un access token scaduto viene rinnovato con il refresh token", async () => {
    const store = newStore();
    const fetchImpl = vi
      .fn()
      // login: access token già scaduto rispetto a `now`
      .mockResolvedValueOnce(jsonResponse(session({ expiresAt: "1970-01-01T00:00:00.000Z" })))
      // refresh
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "access-2",
          refreshToken: "refresh-2",
          accessTokenExpiresAt: "2100-01-01T00:00:00.000Z",
          refreshTokenExpiresAt: "2100-01-01T00:00:00.000Z",
        }),
      );
    const manager = build(fetchImpl as unknown as typeof fetch, store);
    await manager.login("utente@example.com", "password-lunga");
    await expect(manager.getAccessToken()).resolves.toBe("access-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/auth/refresh");
  });

  it("refresh concorrenti producono UNA sola chiamata di rinnovo", async () => {
    const store = newStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(session({ expiresAt: "1970-01-01T00:00:00.000Z" })))
      .mockResolvedValue(
        jsonResponse({
          accessToken: "access-2",
          refreshToken: "refresh-2",
          accessTokenExpiresAt: "2100-01-01T00:00:00.000Z",
          refreshTokenExpiresAt: "2100-01-01T00:00:00.000Z",
        }),
      );
    const manager = build(fetchImpl as unknown as typeof fetch, store);
    await manager.login("utente@example.com", "password-lunga");
    const [a, b, c] = await Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
    ]);
    expect([a, b, c]).toEqual(["access-2", "access-2", "access-2"]);
    // 1 login + 1 solo refresh, non 3.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("API irraggiungibile: segnala offline e NON distrugge la sessione", async () => {
    const store = newStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(session({ expiresAt: "1970-01-01T00:00:00.000Z" })))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const manager = build(fetchImpl as unknown as typeof fetch, store);
    await manager.login("utente@example.com", "password-lunga");
    await expect(manager.getAccessToken()).resolves.toBeNull();
    expect(manager.getStatus().offline).toBe(true);
    // Il refresh token resta: al ritorno della rete la sessione riparte.
    expect(store.loadRefreshToken()).toBe("refresh-1");
  });

  it("rifiuto esplicito del server: sessione chiusa e token cancellati", async () => {
    const store = newStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(session({ expiresAt: "1970-01-01T00:00:00.000Z" })))
      .mockResolvedValueOnce(jsonResponse({ error: "invalid_refresh" }, 401));
    const manager = build(fetchImpl as unknown as typeof fetch, store);
    await manager.login("utente@example.com", "password-lunga");
    await expect(manager.getAccessToken()).resolves.toBeNull();
    expect(manager.getStatus().authenticated).toBe(false);
    expect(store.loadRefreshToken()).toBeNull();
  });

  it("il logout cancella i token anche se l'API non risponde", async () => {
    const store = newStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(session()))
      .mockRejectedValueOnce(new Error("offline"));
    const manager = build(fetchImpl as unknown as typeof fetch, store);
    await manager.login("utente@example.com", "password-lunga");
    const status = await manager.logout();
    expect(status.authenticated).toBe(false);
    expect(store.loadRefreshToken()).toBeNull();
    expect(store.getAccessToken()).toBeNull();
  });

  it("senza sessione persistita il restore non chiama la rete", async () => {
    const fetchImpl = vi.fn();
    const manager = build(fetchImpl as unknown as typeof fetch);
    const status = await manager.restore();
    expect(status.authenticated).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
