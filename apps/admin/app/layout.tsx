import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRANDING } from "@businessbox/shared";

export const metadata: Metadata = {
  title: `${BRANDING.productName} — Admin`,
  description: "Dashboard amministrativa di BusinessBox Browser",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
