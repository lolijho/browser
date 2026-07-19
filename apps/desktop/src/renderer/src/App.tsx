import { useEffect, useState } from "react";
import type { AppInfo } from "@businessbox/contracts";

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.businessbox
      .getAppInfo()
      .then(setInfo)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.6 }}>
      <h1>{info?.productName ?? "BusinessBox Browser"}</h1>
      <p>
        Fase 00 completata: shell Electron sicura con React avviata. La vera shell browser (barra
        superiore, sidebar, <code>WebContentsView</code>) arriva con la fase 01.
      </p>
      {error ? (
        <p role="alert">Errore nel bridge IPC: {error}</p>
      ) : info ? (
        <dl>
          <dt>Versione app</dt>
          <dd>
            {info.appVersion} ({info.releaseChannel})
          </dd>
          <dt>Electron</dt>
          <dd>{info.electronVersion}</dd>
          <dt>Chromium</dt>
          <dd>{info.chromeVersion}</dd>
          <dt>Node</dt>
          <dd>{info.nodeVersion}</dd>
        </dl>
      ) : (
        <p>Caricamento informazioni…</p>
      )}
    </main>
  );
}
