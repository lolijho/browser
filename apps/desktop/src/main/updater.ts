import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { BRANDING } from "@businessbox/shared";
import { logger } from "./observability/logger";

/**
 * Auto-update predisposto (prompt 09).
 *
 * Attivo solo per l'app impacchettata e quando esiste un feed di update
 * (configurato da electron-builder tramite `publish`, generando `app-update.yml`).
 * In alpha non firmata NON c'è feed: l'updater resta inerte e lo dichiara nei log,
 * senza mai disabilitare la verifica di firma/integrità.
 *
 * Verifica firma: electron-updater controlla sempre l'integrità (sha512 dal
 * manifest) e, dove disponibile, la firma del codice (publisherName su Windows,
 * code signing su macOS). Non viene mai bypassata: un update non verificato è
 * rifiutato. Con build firmate (fase di rilascio con certificati) l'update
 * diventa effettivo senza modifiche al codice.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    logger.info("updater.skipped", { reason: "app non impacchettata (dev)" });
    return;
  }

  autoUpdater.channel = BRANDING.releaseChannel;
  autoUpdater.autoDownload = false; // scarica solo dopo conferma/logica esplicita
  autoUpdater.autoInstallOnAppQuit = true;
  // Non forzare mai config di dev in produzione: la verifica resta attiva.
  autoUpdater.forceDevUpdateConfig = false;

  autoUpdater.on("checking-for-update", () => logger.info("updater.checking"));
  autoUpdater.on("update-available", (info) =>
    logger.info("updater.available", { version: info.version, channel: autoUpdater.channel }),
  );
  autoUpdater.on("update-not-available", () => logger.info("updater.up_to_date"));
  autoUpdater.on("error", (error) =>
    logger.error("updater.error", { message: error instanceof Error ? error.message : String(error) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    logger.info("updater.downloaded", { version: info.version }),
  );

  // Senza feed configurato `checkForUpdates` fallisce: lo gestiamo come stato
  // atteso in alpha, non come crash.
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    logger.warn("updater.no_feed", {
      detail: error instanceof Error ? error.message : String(error),
      hint: "feed di update non configurato (alpha non firmata): auto-update non attivo",
    });
  });
}
