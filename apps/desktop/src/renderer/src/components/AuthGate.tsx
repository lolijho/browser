import { useState } from "react";
import type { AuthStatus } from "@businessbox/contracts";

interface AuthGateProps {
  /** L'API non risponde: distinguiamo "offline" da "non autenticato". */
  offline: boolean;
  onAuthenticated: (status: AuthStatus) => void;
}

/**
 * Accesso richiesto per l'AI.
 *
 * L'AI consuma token a carico dell'operatore, quindi le rotte sono autenticate
 * e il consumo va attribuito a un'organizzazione. Il resto del browser resta
 * pienamente utilizzabile senza account: questo riquadro compare solo dentro
 * il pannello AI, mai come blocco all'avvio.
 *
 * Le credenziali vengono passate al processo principale, che le invia all'API
 * e conserva i token: non transitano né restano nello stato del renderer.
 */
export function AuthGate({ offline, onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim() || !password) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await window.businessbox.authLogin(email.trim(), password)
          : await window.businessbox.authRegister(email.trim(), password);
      if (result.ok) {
        setPassword("");
        onAuthenticated(result.status);
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-center gap-3 p-4 text-sm">
      <div>
        <h3 className="text-sm font-semibold text-zinc-800">
          {mode === "login" ? "Accedi per usare l'AI" : "Crea un account"}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          L'assistente AI richiede un account. Tutto il resto del browser funziona senza accedere.
        </p>
      </div>

      {offline && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Servizio non raggiungibile. Puoi continuare a navigare: l'AI tornerà disponibile appena la
          connessione si ristabilisce.
        </p>
      )}

      <input
        type="email"
        autoComplete="username"
        value={email}
        placeholder="Email"
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 outline-none focus:border-blue-500"
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        placeholder="Password (min. 10 caratteri)"
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 outline-none focus:border-blue-500"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void submit();
          }
        }}
      />

      {error && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <button
        type="button"
        disabled={busy || !email.trim() || !password}
        className="rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        onClick={() => void submit()}
      >
        {busy ? "Attendere…" : mode === "login" ? "Accedi" : "Crea account"}
      </button>

      <button
        type="button"
        className="text-xs text-zinc-500 underline hover:text-zinc-700"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
      </button>
    </div>
  );
}
