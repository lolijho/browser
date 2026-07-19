import type { ReactNode } from "react";
import type { AdminFetchResult } from "../lib/api";

/** Riquadro standard con gestione di errore/API non disponibile. */
export function Panel<T>({
  title,
  result,
  render,
}: {
  title: string;
  result: AdminFetchResult<T>;
  render: (data: T) => ReactNode;
}) {
  return (
    <section
      style={{
        background: "white",
        borderRadius: 10,
        padding: "1.25rem",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        marginBottom: "1.5rem",
      }}
    >
      <h2 style={{ fontSize: "1rem", marginTop: 0 }}>{title}</h2>
      {result.ok && result.data ? (
        render(result.data)
      ) : (
        <p
          style={{
            color: "#a16207",
            fontSize: "0.85rem",
            background: "#fef9c3",
            padding: "0.5rem 0.75rem",
            borderRadius: 6,
          }}
        >
          {result.error ?? "Nessun dato"} — avvia l'API (<code>pnpm dev:api</code>) e imposta
          <code> ADMIN_API_KEY</code>.
        </p>
      )}
    </section>
  );
}

export function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "0.4rem",
                  borderBottom: "1px solid #e4e4e7",
                  color: "#71717a",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "0.4rem", borderBottom: "1px solid #f4f4f5" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: "#a1a1aa", fontSize: "0.85rem" }}>Nessun record.</p>}
    </div>
  );
}
