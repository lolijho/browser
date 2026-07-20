import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthTokenStore, type SecureCrypto } from "./token-store";

/** Fake safeStorage: cifratura reversibile (solo per i test). */
function fakeCrypto(available = true): SecureCrypto {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
    decryptString: (buf) => buf.toString("utf8").replace(/^enc:/, ""),
  };
}

function tempPath(): string {
  return join(mkdtempSync(join(tmpdir(), "bbx-auth-")), "refresh.bin");
}

describe("AuthTokenStore", () => {
  it("l'access token vive solo in memoria e scade", () => {
    const store = new AuthTokenStore(fakeCrypto(), tempPath());
    store.setAccessToken("access-abc", new Date(Date.now() + 1000).toISOString());
    expect(store.getAccessToken()).toBe("access-abc");
    expect(store.isAccessTokenExpired(Date.now())).toBe(false);
    expect(store.isAccessTokenExpired(Date.now() + 5000)).toBe(true);
  });

  it("il refresh token viene cifrato su disco e riletto", () => {
    const path = tempPath();
    const store = new AuthTokenStore(fakeCrypto(), path);
    expect(store.saveRefreshToken("refresh-xyz")).toBe(true);
    expect(existsSync(path)).toBe(true);
    // Non è in chiaro sul disco.
    expect(store.loadRefreshToken()).toBe("refresh-xyz");
  });

  it("senza cifratura disponibile NON scrive il refresh in chiaro", () => {
    const path = tempPath();
    const store = new AuthTokenStore(fakeCrypto(false), path);
    expect(store.saveRefreshToken("refresh-xyz")).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  it("logout azzera memoria e rimuove il file cifrato", () => {
    const path = tempPath();
    const store = new AuthTokenStore(fakeCrypto(), path);
    store.setAccessToken("a", new Date(Date.now() + 1000).toISOString());
    store.saveRefreshToken("r");
    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(existsSync(path)).toBe(false);
    expect(store.loadRefreshToken()).toBeNull();
  });
});
