import pg from "pg";
import { parseEnv, serverEnvSchema } from "@businessbox/config";
import { migrate } from "./data/pg/index.js";

/**
 * Comando di migrazione idempotente (prompt 08). Usa l'advisory lock in
 * `migrate()` così più repliche possono avviarlo senza applicare lo schema in
 * parallelo. Eseguito come step controllato prima dell'avvio dei servizi.
 */
const serverEnv = parseEnv(serverEnvSchema);

if (!serverEnv.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL non impostata.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: serverEnv.DATABASE_URL });
try {
  await migrate(pool);
  console.info("[migrate] schema aggiornato.");
} catch (error) {
  console.error("[migrate] fallita:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
