import * as Dialog from "@radix-ui/react-dialog";
import { useShellStore } from "../../store";
import { confirmDeletePage, confirmPinReplacement } from "../../actions";

/**
 * Dialoghi globali delle regole Smart Tabs:
 * - quarta pinned → scegli quale sostituire (regola 5);
 * - eliminazione definitiva di una pagina dirty → conferma (regola 7 + dirty).
 */
export function GlobalDialogs() {
  const browser = useShellStore((s) => s.browser);
  const pendingPin = useShellStore((s) => s.pendingPin);
  const setPendingPin = useShellStore((s) => s.setPendingPin);
  const pendingDelete = useShellStore((s) => s.pendingDelete);
  const setPendingDelete = useShellStore((s) => s.setPendingDelete);

  const pageName = (pageId: string): string => {
    const page = browser.pages.find((p) => p.id === pageId);
    return page?.title || page?.url || pageId;
  };

  return (
    <>
      <Dialog.Root open={pendingPin !== null} onOpenChange={(open) => !open && setPendingPin(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold text-zinc-800">
              Limite di 3 pagine bloccate raggiunto
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-zinc-500">
              Scegli quale pagina sbloccare per fare posto a “
              {pendingPin ? pageName(pendingPin.pageId) : ""}”.
            </Dialog.Description>
            <ul className="mt-3 space-y-1">
              {pendingPin?.pinnedIds.map((pinnedId) => (
                <li key={pinnedId}>
                  <button
                    type="button"
                    className="w-full truncate rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:border-blue-400 hover:bg-blue-50"
                    onClick={() => void confirmPinReplacement(pendingPin.pageId, pinnedId)}
                  >
                    {pageName(pinnedId)}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => setPendingPin(null)}
              >
                Annulla
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold text-zinc-800">
              Chiudere definitivamente la pagina?
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-zinc-500">
              “{pendingDelete ? pageName(pendingDelete.pageId) : ""}” ha modifiche non salvate:{" "}
              {pendingDelete?.reason}
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => setPendingDelete(null)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                onClick={() => pendingDelete && void confirmDeletePage(pendingDelete.pageId)}
              >
                Elimina definitivamente
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
