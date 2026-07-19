import type { DesktopVersion } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function VersionsPage() {
  const result = await adminFetch<{ versions: DesktopVersion[] }>("/api/v1/admin/desktop-versions");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Versioni desktop</h1>
      <Panel
        title="Release pubblicate"
        result={result}
        render={(data) => (
          <Table
            head={["Canale", "Versione", "Rilasciata"]}
            rows={data.versions.map((v) => [
              v.channel,
              v.version,
              new Date(v.releasedAt).toLocaleDateString("it-IT"),
            ])}
          />
        )}
      />
    </>
  );
}
