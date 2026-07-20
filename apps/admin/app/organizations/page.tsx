import type { AdminOrganizationRow } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const result = await adminFetch<{ organizations: AdminOrganizationRow[] }>(
    "/api/v1/admin/organizations",
  );
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Organizzazioni</h1>
      <Panel
        title="Organizzazioni"
        result={result}
        render={(data) => (
          <Table
            head={["Nome", "Membri", "Piano", "Creata"]}
            rows={data.organizations.map((o) => [
              o.name,
              o.memberCount,
              o.planId ?? "—",
              new Date(o.createdAt).toLocaleDateString("it-IT"),
            ])}
          />
        )}
      />
    </>
  );
}
