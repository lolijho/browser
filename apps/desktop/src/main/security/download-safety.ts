import { basename, extname } from "node:path";

/**
 * Sicurezza dei download (prompt 07): estensioni rischiose che richiedono
 * conferma, nomi duplicati sicuri, mai esecuzione automatica.
 */
const RISKY_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".app",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm",
  ".sh",
  ".apk",
  ".lnk",
]);

export function isRiskyDownload(filename: string): boolean {
  return RISKY_EXTENSIONS.has(extname(filename).toLowerCase());
}

/** Nome file sanitizzato: niente path traversal, niente caratteri di controllo. */
export function sanitizeFilename(rawName: string): string {
  const base = basename(rawName)
    // eslint-disable-next-line no-control-regex -- rimozione volontaria dei control char
    .replace(/[\u0000-\u001F<>:"/\\|?*]/g, "_")
    .trim();
  const cleaned = base.replace(/^\.+/, "").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "download";
}

/**
 * Genera un nome non collidente: `file.pdf` → `file (1).pdf` se esiste già.
 * `exists` è iniettabile (test senza filesystem).
 */
export function uniqueFilename(desired: string, exists: (name: string) => boolean): string {
  const safe = sanitizeFilename(desired);
  if (!exists(safe)) {
    return safe;
  }
  const ext = extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `${stem} (${i})${ext}`;
    if (!exists(candidate)) {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}
