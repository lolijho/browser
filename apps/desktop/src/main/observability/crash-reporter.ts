import { crashReporter } from "electron";
import { BRANDING } from "@businessbox/shared";
import { logger } from "./logger";

/**
 * Crash report opt-in (prompt 09).
 *
 * Disattivato per impostazione predefinita: si abilita solo con consenso
 * esplicito (`BUSINESSBOX_CRASH_REPORTS=1` o impostazione utente). Anche quando
 * abilitato, senza un endpoint di raccolta configurato i minidump restano
 * LOCALI (`uploadToServer: false`): nessun invio in rete.
 *
 * Privacy: non vengono aggiunti dati di navigazione (URL, titoli, contenuti)
 * nei metadati del crash. La telemetria non trasporta la cronologia.
 */
export interface CrashReporterOptions {
  optIn: boolean;
  /** Endpoint di raccolta; se assente, i minidump restano locali. */
  submitUrl?: string;
}

export function initCrashReporter(options: CrashReporterOptions): void {
  if (!options.optIn) {
    logger.info("crash_reporter.disabled", { reason: "opt-in non concesso" });
    return;
  }
  const uploadToServer = Boolean(options.submitUrl);
  crashReporter.start({
    productName: BRANDING.productName,
    companyName: BRANDING.productName,
    // Electron richiede una submitURL non vuota; senza endpoint reale i dump
    // restano locali perché uploadToServer=false.
    submitURL: options.submitUrl ?? "https://crash.invalid/submit",
    uploadToServer,
    compress: true,
    // Nessun campo `extra`: niente URL/titoli/contenuti di navigazione.
    extra: {},
  });
  logger.info("crash_reporter.enabled", { uploadToServer });
}
