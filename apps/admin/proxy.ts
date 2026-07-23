import { NextResponse, type NextRequest } from "next/server";
import { evaluateAccess } from "./lib/basic-auth";

/**
 * Autenticazione della dashboard admin (M8 hardening).
 *
 * La dashboard rende dati sensibili di TUTTI i tenant (utenti, organizzazioni,
 * audit, consumo AI): il server Next.js autentica verso l'API con la
 * `ADMIN_API_KEY` per conto di chi apre la pagina, quindi senza un gate
 * chiunque conosca l'URL vedrebbe tutto. Qui mettiamo HTTP Basic Auth davanti a
 * ogni pagina.
 *
 * Fail-closed: se `ADMIN_DASHBOARD_PASSWORD` non è configurata la dashboard è
 * CHIUSA (503), non aperta. Logica in `lib/basic-auth.ts` (testata a parte).
 *
 * File `proxy.ts` (non `middleware.ts`): è la convenzione di Next 16, che ha
 * deprecato il nome precedente.
 */
export function proxy(request: NextRequest): NextResponse {
  const decision = evaluateAccess({
    pathname: request.nextUrl.pathname,
    authorizationHeader: request.headers.get("authorization"),
    expectedUser: process.env.ADMIN_DASHBOARD_USER || "admin",
    expectedPassword: process.env.ADMIN_DASHBOARD_PASSWORD ?? "",
  });

  if (decision === "allow") {
    return NextResponse.next();
  }
  if (decision === "not-configured") {
    return new NextResponse(
      "Dashboard non configurata: impostare ADMIN_DASHBOARD_PASSWORD sul servizio admin.",
      { status: 503 },
    );
  }
  return new NextResponse("Autenticazione richiesta.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="BusinessBox Admin", charset="UTF-8"',
    },
  });
}

export const config = {
  // Protegge tutto tranne gli asset statici di Next. `/api/health` passa il
  // matcher ma è esentato in `evaluateAccess`, per l'healthcheck del container.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
