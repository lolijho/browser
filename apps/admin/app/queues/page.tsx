export const dynamic = "force-dynamic";

/** Code worker: le statistiche live richiedono Redis/BullMQ (fase 08 in Coolify). */
export default function QueuesPage() {
  const queues = ["classification", "summary", "embedding", "dedup", "cleanup", "email", "sync"];
  return (
    <>
      <h1 style={{ fontSize: "1.4rem" }}>Code worker</h1>
      <section
        style={{
          background: "white",
          borderRadius: 10,
          padding: "1.25rem",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <p style={{ color: "#71717a", fontSize: "0.9rem" }}>
          Code BullMQ configurate. Le statistiche live (waiting/active/failed) sono disponibili con
          Redis connesso (deploy Coolify, fase 08).
        </p>
        <ul style={{ fontSize: "0.85rem", color: "#3f3f46" }}>
          {queues.map((q) => (
            <li key={q}>
              <code>businessbox-{q}</code>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
