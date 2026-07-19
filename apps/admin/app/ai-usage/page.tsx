import type { AiUsageSummary } from "@businessbox/contracts";
import { adminFetch } from "../../lib/api";
import { Panel, Table } from "../components";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  const result = await adminFetch<{ usage: AiUsageSummary[] }>("/api/v1/admin/ai-usage");
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Consumo AI</h1>
      <Panel
        title="Token e costi per organizzazione/giorno"
        result={result}
        render={(data) => (
          <Table
            head={["Org", "Giorno", "Input", "Output", "Costo $"]}
            rows={data.usage.map((u) => [
              u.organizationId.slice(0, 8),
              u.day,
              u.inputTokens,
              u.outputTokens,
              u.costUsd.toFixed(4),
            ])}
          />
        )}
      />
    </>
  );
}
