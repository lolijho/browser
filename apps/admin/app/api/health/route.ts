/**
 * Endpoint di liveness della dashboard admin (fase 08): usato dall'healthcheck
 * del container. Non tocca l'API né i segreti, riporta solo che il server Next
 * risponde. Reso dinamico per evitare la generazione statica in build.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", service: "admin" });
}
