import type { AiPrivacyMode } from "@businessbox/contracts";

export type AiDecision = "allow" | "confirm" | "block";

export interface AiPolicyInput {
  privacyMode: AiPrivacyMode;
  /** Modalità privata (finestra/workspace privato): AI off per default. */
  privateMode: boolean;
  /** Flag della PageCard. */
  allowAI: boolean;
  /** Consenso temporaneo esplicito dato dall'utente in modalità privata. */
  privateConsent?: boolean;
}

/**
 * Decisione di policy AI (prompt 07). Applicata sia in UI sia server-side.
 * - local-only → sempre bloccata (nessun invio cloud);
 * - allowAI=false sulla pagina → bloccata;
 * - modalità privata → bloccata salvo consenso esplicito temporaneo;
 * - confirm → richiede conferma;
 * - cloud-ai → consentita.
 */
export function resolveAiPolicy(input: AiPolicyInput): AiDecision {
  if (!input.allowAI) {
    return "block";
  }
  if (input.privacyMode === "local-only") {
    return "block";
  }
  if (input.privateMode) {
    return input.privateConsent ? "confirm" : "block";
  }
  if (input.privacyMode === "confirm") {
    return "confirm";
  }
  return "allow";
}
