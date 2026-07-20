import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useActiveSearchEngine, useShellStore } from "../../store";

/**
 * Gestione motori (prompt 03): elenco con default, aggiunta custom con
 * validazioni severe lato main, rimozione, import/export impostazioni.
 */
export function EngineManagerDialog() {
  const open = useShellStore((s) => s.showEngineManager);
  const setOpen = useShellStore((s) => s.setShowEngineManager);
  const browser = useShellStore((s) => s.browser);
  const setNotice = useShellStore((s) => s.setNotice);
  const defaultEngine = useActiveSearchEngine();

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [form, setForm] = useState({ name: "", keyword: "", searchUrlTemplate: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const settings = browser.searchSettings;

  const submitAdd = async () => {
    const result = await window.businessbox.addCustomEngine({
      name: form.name,
      keyword: form.keyword,
      searchUrlTemplate: form.searchUrlTemplate,
      scope: "global",
    });
    if (result.ok) {
      setAdding(false);
      setForm({ name: "", keyword: "", searchUrlTemplate: "" });
      setFormError(null);
    } else {
      setFormError(result.reason ?? "Motore non valido");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[34rem] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-zinc-800">
            Motori di ricerca
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-zinc-500">
            Default globale:{" "}
            {settings.engines.find((e) => e.id === settings.globalDefaultEngineId)?.name}
            {" · "}Default modalità privata:{" "}
            {settings.engines.find((e) => e.id === settings.privateDefaultEngineId)?.name}
          </Dialog.Description>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] text-zinc-400 uppercase">
                  <th className="py-1 pr-2 font-semibold">Motore</th>
                  <th className="py-1 pr-2 font-semibold">Keyword</th>
                  <th className="py-1 pr-2 font-semibold">Tipo</th>
                  <th className="py-1 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {settings.engines.map((engine) => (
                  <tr key={engine.id} className="border-t border-zinc-100">
                    <td className="py-1.5 pr-2 text-zinc-800">
                      {engine.name}
                      {engine.id === defaultEngine?.id && (
                        <span className="ml-1 text-[10px] text-blue-600">● default attivo</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-zinc-500">:{engine.keyword}</td>
                    <td className="py-1.5 pr-2 text-zinc-500">{engine.type}</td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="mr-2 text-[12px] text-blue-600 hover:underline"
                        onClick={() =>
                          void window.businessbox.setSearchDefault(engine.id, "global")
                        }
                      >
                        default globale
                      </button>
                      <button
                        type="button"
                        className="mr-2 text-[12px] text-blue-600 hover:underline"
                        onClick={() =>
                          void window.businessbox.setSearchDefault(
                            engine.id,
                            "workspace",
                            browser.activeWorkspaceId,
                          )
                        }
                      >
                        default workspace
                      </button>
                      {engine.type !== "built-in" && (
                        <button
                          type="button"
                          className="text-[12px] text-red-600 hover:underline"
                          onClick={() =>
                            void window.businessbox.removeEngine(engine.id).then((r) => {
                              if (!r.ok) {
                                setNotice(r.reason ?? "Rimozione non consentita");
                              }
                            })
                          }
                        >
                          rimuovi
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {adding && (
              <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-[12px] font-semibold text-zinc-700">Nuovo motore custom</p>
                <input
                  className="h-8 w-full rounded-md border border-zinc-300 px-2 text-[13px] outline-none focus:border-blue-500"
                  placeholder="Nome (es. Docs interni)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="h-8 w-full rounded-md border border-zinc-300 px-2 text-[13px] outline-none focus:border-blue-500"
                  placeholder="Keyword (es. docs)"
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                />
                <input
                  className="h-8 w-full rounded-md border border-zinc-300 px-2 text-[13px] outline-none focus:border-blue-500"
                  placeholder="URL con %s (es. https://docs.example/search?q=%s)"
                  value={form.searchUrlTemplate}
                  onChange={(e) => setForm({ ...form, searchUrlTemplate: e.target.value })}
                />
                {formError && <p className="text-[12px] text-red-600">{formError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-[12px]"
                    onClick={() => setAdding(false)}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-blue-600 px-2 py-1 text-[12px] font-medium text-white"
                    onClick={() => void submitAdd()}
                  >
                    Aggiungi
                  </button>
                </div>
              </div>
            )}

            {importing && (
              <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-[12px] font-semibold text-zinc-700">
                  Importa impostazioni (JSON)
                </p>
                <textarea
                  rows={5}
                  className="w-full rounded-md border border-zinc-300 p-2 font-mono text-[11px] outline-none focus:border-blue-500"
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-[12px]"
                    onClick={() => setImporting(false)}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-blue-600 px-2 py-1 text-[12px] font-medium text-white"
                    onClick={() =>
                      void window.businessbox.importSearchSettings(importJson).then((r) => {
                        setNotice(r.ok ? "Impostazioni importate" : (r.reason ?? "Import fallito"));
                        if (r.ok) {
                          setImporting(false);
                          setImportJson("");
                        }
                      })
                    }
                  >
                    Importa
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50"
                onClick={() => setAdding(true)}
              >
                + Aggiungi motore
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50"
                onClick={() =>
                  void window.businessbox.exportSearchSettings().then(async ({ json }) => {
                    await window.businessbox.copyText(json);
                    setNotice("Impostazioni motori copiate negli appunti (JSON)");
                  })
                }
              >
                Esporta
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50"
                onClick={() => setImporting(true)}
              >
                Importa
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[13px] font-medium text-white"
              >
                Chiudi
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
