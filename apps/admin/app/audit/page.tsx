import type { AuditLogRow } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const result = await adminFetch<{ entries: AuditLogRow[] }>("/api/v1/admin/audit");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Audit log</h1>
      <Panel
        title="Attività recenti"
        result={result}
        render={(data) => (
          <Table
            head={["Azione", "Attore", "Target", "Quando"]}
            rows={data.entries.map((e) => [
              e.action,
              e.actorId?.slice(0, 8) ?? "—",
              e.targetType,
              new Date(e.createdAt).toLocaleString("it-IT"),
            ])}
          />
        )}
      />
    </>
  );
}
