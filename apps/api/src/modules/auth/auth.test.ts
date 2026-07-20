import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../../data/memory.js";
import { AuthService, AuthError } from "./service.js";
import { verifyAccessToken, type TokenConfig } from "./tokens.js";

const TOKEN_CONFIG: TokenConfig = {
  accessSecret: "test-secret-che-e-lungo-abbastanza-1234567890",
  accessTtlSeconds: 900,
  refreshTtlSeconds: 60 * 60 * 24 * 30,
};

function makeService() {
  const repos = createMemoryRepositories();
  return { repos, service: new AuthService({ repos, tokenConfig: TOKEN_CONFIG }) };
}

describe("AuthService", () => {
  it("registra un utente, crea org+device e rilascia token verificabili", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "mario@example.com",
      password: "password-sicura-1",
      organizationName: "Rossi SRL",
    });
    expect(session.user.email).toBe("mario@example.com");
    expect(session.organizationId).toBeTruthy();
    expect(session.deviceId).toBeTruthy();
    const claims = await verifyAccessToken(session.tokens.accessToken, TOKEN_CONFIG);
    expect(claims?.sub).toBe(session.user.id);
    expect(claims?.org).toBe(session.organizationId);
    expect(claims?.type).toBe("access");
  });

  it("rifiuta email duplicata", async () => {
    const { service } = makeService();
    await service.register({ email: "a@example.com", password: "password-sicura-1" });
    await expect(
      service.register({ email: "A@example.com", password: "password-sicura-2" }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("login con password corretta e rifiuto di quella errata", async () => {
    const { service } = makeService();
    await service.register({ email: "b@example.com", password: "password-sicura-1" });
    const session = await service.login({ email: "b@example.com", password: "password-sicura-1" });
    expect(session.user.email).toBe("b@example.com");
    await expect(
      service.login({ email: "b@example.com", password: "password-sbagliata" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("login di un'email inesistente non rivela nulla (invalid_credentials)", async () => {
    const { service } = makeService();
    await expect(
      service.login({ email: "nessuno@example.com", password: "qualcosa-di-lungo" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("refresh ruota il token e permette di continuare", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "c@example.com",
      password: "password-sicura-1",
    });
    const rotated = await service.refresh(session.tokens.refreshToken);
    expect(rotated.refreshToken).not.toBe(session.tokens.refreshToken);
    // Il nuovo refresh funziona.
    await expect(service.refresh(rotated.refreshToken)).resolves.toBeTruthy();
  });

  it("il riuso di un refresh già ruotato revoca l'intera catena (furto)", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "d@example.com",
      password: "password-sicura-1",
    });
    const rotated = await service.refresh(session.tokens.refreshToken);
    // Riuso del vecchio token → allarme furto.
    await expect(service.refresh(session.tokens.refreshToken)).rejects.toMatchObject({
      code: "refresh_reused",
    });
    // Anche il token ruotato viene invalidato.
    await expect(service.refresh(rotated.refreshToken)).rejects.toMatchObject({
      code: "invalid_refresh",
    });
  });

  it("logout revoca il refresh token", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "e@example.com",
      password: "password-sicura-1",
    });
    await service.logout(session.tokens.refreshToken);
    await expect(service.refresh(session.tokens.refreshToken)).rejects.toMatchObject({
      code: "invalid_refresh",
    });
  });

  it("revoca dispositivo: i refresh del device non funzionano più", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "f@example.com",
      password: "password-sicura-1",
    });
    expect(await service.revokeDevice(session.user.id, session.deviceId)).toBe(true);
    await expect(service.refresh(session.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it("un utente non può revocare il dispositivo di un altro", async () => {
    const { service } = makeService();
    const a = await service.register({ email: "g@example.com", password: "password-sicura-1" });
    const b = await service.register({ email: "h@example.com", password: "password-sicura-1" });
    expect(await service.revokeDevice(b.user.id, a.deviceId)).toBe(false);
  });

  it("reset password invalida i refresh esistenti", async () => {
    const { service } = makeService();
    const session = await service.register({
      email: "i@example.com",
      password: "password-sicura-1",
    });
    await service.resetPassword(session.user.id, "nuova-password-sicura-2");
    await expect(service.refresh(session.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(
      service.login({ email: "i@example.com", password: "nuova-password-sicura-2" }),
    ).resolves.toBeTruthy();
  });
});
