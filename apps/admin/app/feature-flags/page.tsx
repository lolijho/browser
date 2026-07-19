import type { FeatureFlag } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  const result = await adminFetch<{ flags: FeatureFlag[] }>("/api/v1/admin/feature-flags");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Feature flag</h1>
      <Panel
        title="Flag attivi"
        result={result}
        render={(data) => (
          <Table
            head={["Chiave", "Attivo", "Descrizione"]}
            rows={data.flags.map((f) => [f.key, f.enabled ? "sì" : "no", f.description])}
          />
        )}
      />
    </>
  );
}
