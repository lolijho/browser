import type { AdminUserRow } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const result = await adminFetch<{ users: AdminUserRow[] }>("/api/v1/admin/users");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Utenti</h1>
      <Panel
        title="Utenti registrati"
        result={result}
        render={(data) => (
          <Table
            head={["Email", "Verificata", "Org", "Dispositivi", "Creato"]}
            rows={data.users.map((u) => [
              u.email,
              u.emailVerified ? "sì" : "no",
              u.organizationId.slice(0, 8),
              u.deviceCount,
              new Date(u.createdAt).toLocaleDateString("it-IT"),
            ])}
          />
        )}
      />
    </>
  );
}
