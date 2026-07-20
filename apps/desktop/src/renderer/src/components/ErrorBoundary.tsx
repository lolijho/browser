import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary della shell (prompt 09). Un errore di rendering non deve far
 * "sparire" la finestra: mostriamo un pannello di ripristino con la possibilità
 * di ricaricare la shell. Le pagine web (WebContentsView) sono isolate dalla
 * shell, quindi restano gestite dal loro recupero crash nel main process.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log locale (nessun invio remoto): utile in sviluppo e nei crash report opt-in.
    console.error("[shell] errore di rendering:", error.message, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-100 p-8 text-center">
          <h1 className="text-lg font-semibold text-zinc-800">
            L'interfaccia ha riscontrato un problema
          </h1>
          <p className="max-w-md text-sm text-zinc-600">
            Le tue pagine e i workspace sono salvati localmente e verranno ripristinati. Ricarica
            l'interfaccia per continuare.
          </p>
          <pre className="max-w-md overflow-auto rounded-lg bg-zinc-200 p-3 text-left text-xs text-zinc-700">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Ricarica interfaccia
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
