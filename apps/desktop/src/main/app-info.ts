import { appInfoSchema, type AppInfo } from "@businessbox/contracts";
import { BRANDING } from "@businessbox/shared";

export interface RuntimeVersions {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

/**
 * Costruisce e valida le informazioni di runtime esposte al renderer.
 * Pura e testabile senza Electron.
 */
export function buildAppInfo(versions: RuntimeVersions): AppInfo {
  return appInfoSchema.parse({
    productName: BRANDING.productName,
    releaseChannel: BRANDING.releaseChannel,
    ...versions,
  });
}
