import { useShellStore } from "./store";

/** Azioni asincrone verso il main che richiedono gestione di esiti/dialoghi. */

export async function requestPinToggle(pageId: string, pinned: boolean): Promise<void> {
  const result = await window.businessbox.setPinned(pageId, pinned);
  const { setPendingPin, setNotice } = useShellStore.getState();
  if (result.ok) {
    setNotice(null);
    return;
  }
  if (result.needsReplacement) {
    setPendingPin({ pageId, pinnedIds: result.pinnedIds ?? [] });
    return;
  }
  setNotice(result.reason ?? "Operazione non consentita");
}

export async function confirmPinReplacement(pageId: string, replacePageId: string): Promise<void> {
  await window.businessbox.setPinned(pageId, true, replacePageId);
  useShellStore.getState().setPendingPin(null);
}

export async function requestDeletePage(pageId: string): Promise<void> {
  const result = await window.businessbox.deletePage(pageId);
  if (!result.ok && result.needsConfirmation) {
    useShellStore
      .getState()
      .setPendingDelete({ pageId, reason: result.reason ?? "Modifiche non salvate" });
  }
}

export async function confirmDeletePage(pageId: string): Promise<void> {
  await window.businessbox.deletePage(pageId, true);
  useShellStore.getState().setPendingDelete(null);
}

export async function copyPageUrl(url: string): Promise<void> {
  await window.businessbox.copyText(url);
  useShellStore.getState().setNotice("URL copiato negli appunti");
}
