import type { ServiceHealth } from "@businessbox/contracts";
import { adminFetch } from "../lib/api";
import { Panel, Table } from "./components";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await adminFetch<{ services: ServiceHealth[] }>("/api/v1/admin/health");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Panoramica</h1>
      <p style={{ color: "#71717a", fontSize: "0.9rem" }}>
        Stato dei servizi e accesso alle sezioni amministrative. Gli amministratori non vedono il
        contenuto privato delle pagine degli utenti.
      </p>
      <Panel
        title="Salute servizi"
        result={health}
        render={(data) => (
          <Table
            head={["Servizio", "Stato", "Dettaglio"]}
            rows={data.services.map((s) => [s.service, s.status, s.detail ?? "—"])}
          />
        )}
      />
    </>
  );
}
