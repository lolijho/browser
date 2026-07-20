import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

interface NameDialogProps {
  open: boolean;
  title: string;
  description: string;
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NameDialog({
  open,
  title,
  description,
  placeholder,
  onConfirm,
  onCancel,
}: NameDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-zinc-800">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-zinc-500">
            {description}
          </Dialog.Description>
          <input
            autoFocus
            type="text"
            value={name}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="mt-3 h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-blue-500"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={onCancel}
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!name.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              onClick={submit}
            >
              Crea
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
