/**
 * Branding centralizzato del prodotto.
 * Ogni riferimento a nome, bundle id, URL API o canale release deve passare da qui,
 * mai da stringhe sparse nel codice (requisito CLAUDE.md).
 */
export type ReleaseChannel = "alpha" | "beta" | "stable";

export interface Branding {
  /** Nome commerciale mostrato all'utente. */
  productName: string;
  /** Nome tecnico dell'applicazione (artifact, cartelle dati). */
  appName: string;
  /** Bundle identifier per il packaging desktop. */
  bundleId: string;
  /** URL API di default; sovrascrivibile via configurazione. */
  defaultApiUrl: string;
  /** Canale di release corrente. */
  releaseChannel: ReleaseChannel;
}

export const BRANDING: Branding = {
  productName: "BusinessBox Browser",
  appName: "businessbox-browser",
  bundleId: "com.businessbox.browser",
  defaultApiUrl: "http://localhost:3000",
  releaseChannel: "alpha",
};
