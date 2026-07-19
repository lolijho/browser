import { describe, expect, it } from "vitest";
import { GUARDED_PERMISSIONS, PermissionManager } from "./permission-manager";
import { isRiskyDownload, sanitizeFilename, uniqueFilename } from "./download-safety";

describe("PermissionManager — deny-by-default per dominio+workspace", () => {
  it("una richiesta mai decisa ritorna null (prompt all'utente)", () => {
    const pm = new PermissionManager();
    expect(pm.check("ws1", "https://sito.example/x", "camera")).toBeNull();
  });

  it("concessione e revoca per dominio+workspace", () => {
    const pm = new PermissionManager();
    pm.set("ws1", "https://sito.example", "microphone", "granted");
    expect(pm.check("ws1", "https://sito.example/pagina", "microphone")).toBe("granted");
    // Altro workspace: nessuna decisione ereditata.
    expect(pm.check("ws2", "https://sito.example", "microphone")).toBeNull();
    pm.revoke("ws1", "sito.example", "microphone");
    expect(pm.check("ws1", "https://sito.example", "microphone")).toBeNull();
  });

  it("origini non http/https sono sempre negate", () => {
    const pm = new PermissionManager();
    expect(pm.check("ws1", "file:///etc/passwd", "geolocation")).toBe("denied");
    expect(pm.check("ws1", "data:text/html,x", "camera")).toBe("denied");
  });

  it("copre tutti i permessi sensibili richiesti dal prompt", () => {
    expect(GUARDED_PERMISSIONS).toEqual(
      expect.arrayContaining([
        "camera",
        "microphone",
        "geolocation",
        "notifications",
        "midi",
        "clipboard-read",
        "display-capture",
      ]),
    );
  });

  it("revoca a livello di dominio azzera tutti i workspace", () => {
    const pm = new PermissionManager();
    pm.set("ws1", "https://sito.example", "camera", "granted");
    pm.set("ws2", "https://sito.example", "camera", "granted");
    pm.revokeDomain("sito.example");
    expect(pm.check("ws1", "https://sito.example", "camera")).toBeNull();
    expect(pm.check("ws2", "https://sito.example", "camera")).toBeNull();
  });
});

describe("Sicurezza download", () => {
  it("riconosce le estensioni rischiose", () => {
    expect(isRiskyDownload("installer.exe")).toBe(true);
    expect(isRiskyDownload("script.SH")).toBe(true);
    expect(isRiskyDownload("documento.pdf")).toBe(false);
    expect(isRiskyDownload("foto.png")).toBe(false);
  });

  it("sanitizza i nomi file (niente path traversal)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("report:2026.pdf")).toBe("report_2026.pdf");
    expect(sanitizeFilename("")).toBe("download");
  });

  it("genera nomi duplicati sicuri", () => {
    const existing = new Set(["file.pdf", "file (1).pdf"]);
    expect(uniqueFilename("file.pdf", (n) => existing.has(n))).toBe("file (2).pdf");
    expect(uniqueFilename("nuovo.pdf", (n) => existing.has(n))).toBe("nuovo.pdf");
  });
});
