/**
 * Logger strutturato minimale del main process (prompt 09).
 * Emette una riga JSON per evento su stdout/stderr: facile da raccogliere e da
 * filtrare. NON è telemetria remota: i log locali possono contenere URL, mentre
 * i crash report (opt-in) non includono mai dati di navigazione.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): number {
  const env = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  return LEVEL_ORDER[(env as LogLevel) in LEVEL_ORDER ? (env as LogLevel) : "info"];
}

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < currentThreshold()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>): void => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>): void => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>): void => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>): void => emit("error", event, fields),
};
