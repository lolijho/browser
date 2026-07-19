import { z } from "zod";

/**
 * Modalità privacy AI (prompt 07):
 * - cloud-ai: l'AI cloud può essere usata liberamente;
 * - confirm: chiedi conferma prima di ogni invio all'AI;
 * - local-only: nessun invio all'AI cloud (solo funzioni locali).
 */
export const aiPrivacyModeSchema = z.enum(["cloud-ai", "confirm", "local-only"]);
export type AiPrivacyMode = z.infer<typeof aiPrivacyModeSchema>;

export const privacySettingsSchema = z.object({
  aiPrivacyMode: aiPrivacyModeSchema,
  /** Suggerimenti di ricerca remoti: disabilitati fino al consenso. */
  remoteSuggestionsConsent: z.boolean(),
  /** Screenshot globali abilitati (comunque per-pagina con allowScreenshot). */
  screenshotsEnabled: z.boolean(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  aiPrivacyMode: "confirm",
  remoteSuggestionsConsent: false,
  screenshotsEnabled: true,
};

export const setPrivacyModeRequestSchema = z.object({
  mode: aiPrivacyModeSchema,
});
export type SetPrivacyModeRequest = z.infer<typeof setPrivacyModeRequestSchema>;

/** Permesso browser (prompt 07): deny-by-default, deciso per dominio+workspace. */
export const permissionKindSchema = z.enum([
  "camera",
  "microphone",
  "geolocation",
  "notifications",
  "midi",
  "clipboard-read",
  "display-capture",
]);
export type PermissionKindSchema = z.infer<typeof permissionKindSchema>;

export const permissionDecisionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  domain: z.string().min(1).max(255),
  permission: permissionKindSchema,
  decision: z.enum(["granted", "denied"]),
});
export type PermissionDecisionRequest = z.infer<typeof permissionDecisionRequestSchema>;

export const revokePermissionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  domain: z.string().min(1).max(255),
  permission: permissionKindSchema,
});
export type RevokePermissionRequest = z.infer<typeof revokePermissionRequestSchema>;
