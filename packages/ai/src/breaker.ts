/**
 * Circuit breaker per le chiamate OpenRouter (prompt 05): dopo N fallimenti
 * ravvicinati smette di chiamare per un periodo di raffreddamento.
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  windowMs: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(
    private readonly options: CircuitBreakerOptions = {
      failureThreshold: 5,
      windowMs: 30_000,
      cooldownMs: 60_000,
    },
    private readonly now: () => number = () => Date.now(),
  ) {}

  canRequest(): boolean {
    if (this.openedAt === null) {
      return true;
    }
    if (this.now() - this.openedAt >= this.options.cooldownMs) {
      // Half-open: si riprova; un successo chiude, un fallimento riapre.
      this.openedAt = null;
      this.failures = [];
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
  }

  recordFailure(): void {
    const timestamp = this.now();
    this.failures = this.failures.filter((t) => timestamp - t < this.options.windowMs);
    this.failures.push(timestamp);
    if (this.failures.length >= this.options.failureThreshold) {
      this.openedAt = timestamp;
    }
  }

  isOpen(): boolean {
    return !this.canRequest();
  }
}
