/**
 * Limiti di budget (prompt 05). In fase 05 i limiti sono per processo
 * (giornaliero e per singola richiesta); i limiti per utente/organizzazione
 * e mese arrivano con la fase 06 (PostgreSQL, tabella ai_usage).
 * A budget esaurito il browser continua a funzionare con la ricerca locale.
 */
export interface AiBudgetLimits {
  dailyTokens: number;
  perRequestTokens: number;
}

export interface AiBudgetVerdict {
  allowed: boolean;
  reason?: string;
}

export class AiBudgetTracker {
  private dayKey = "";
  private dayTokens = 0;

  constructor(
    private readonly limits: AiBudgetLimits,
    private readonly now: () => Date = () => new Date(),
  ) {}

  checkRequest(estimatedTokens: number): AiBudgetVerdict {
    this.rollover();
    if (estimatedTokens > this.limits.perRequestTokens) {
      return {
        allowed: false,
        reason: `Richiesta oltre il limite di ${this.limits.perRequestTokens} token`,
      };
    }
    if (this.dayTokens + estimatedTokens > this.limits.dailyTokens) {
      return {
        allowed: false,
        reason: "Budget AI giornaliero esaurito: il browser continua con la ricerca locale",
      };
    }
    return { allowed: true };
  }

  recordUsage(tokens: number): void {
    this.rollover();
    this.dayTokens += Math.max(0, tokens);
  }

  getUsage(): { day: string; tokens: number; dailyLimit: number } {
    this.rollover();
    return { day: this.dayKey, tokens: this.dayTokens, dailyLimit: this.limits.dailyTokens };
  }

  private rollover(): void {
    const key = this.now().toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayTokens = 0;
    }
  }
}

/** Stima prudente dei token di una richiesta (~4 caratteri per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
