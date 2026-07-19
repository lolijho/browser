import { BRANDING } from "@businessbox/shared";

export default function HomePage() {
  return (
    <main>
      <h1>{BRANDING.productName} — Dashboard amministrativa</h1>
      <p>
        Fase 00: applicazione minima avviabile. Le sezioni operative (utenti, organizzazioni,
        dispositivi, consumo AI, code worker, feature flags, audit log) arrivano nella fase 06.
      </p>
      <dl>
        <dt>Canale release</dt>
        <dd>{BRANDING.releaseChannel}</dd>
        <dt>API di riferimento</dt>
        <dd>
          <code>{process.env.PUBLIC_API_URL ?? BRANDING.defaultApiUrl}</code>
        </dd>
      </dl>
    </main>
  );
}
