import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BRANDING } from "@businessbox/shared";

export const metadata: Metadata = {
  title: `${BRANDING.productName} — Admin`,
  description: "Dashboard amministrativa di BusinessBox Browser",
};

const NAV = [
  { href: "/", label: "Panoramica" },
  { href: "/users", label: "Utenti" },
  { href: "/organizations", label: "Organizzazioni" },
  { href: "/ai-usage", label: "Consumo AI" },
  { href: "/queues", label: "Code worker" },
  { href: "/feature-flags", label: "Feature flag" },
  { href: "/versions", label: "Versioni desktop" },
  { href: "/audit", label: "Audit log" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f4f4f5" }}>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <nav
            style={{
              width: 220,
              background: "#18181b",
              color: "#e4e4e7",
              padding: "1.25rem 0.75rem",
            }}
          >
            <h1 style={{ fontSize: "0.95rem", padding: "0 0.5rem", marginBottom: "1rem" }}>
              {BRANDING.productName}
              <span style={{ display: "block", fontSize: "0.7rem", color: "#a1a1aa" }}>Admin</span>
            </h1>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "0.5rem",
                  borderRadius: 6,
                  color: "#d4d4d8",
                  textDecoration: "none",
                  fontSize: "0.85rem",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main style={{ flex: 1, padding: "2rem" }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
