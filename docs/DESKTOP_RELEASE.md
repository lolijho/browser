# Build desktop — BusinessBox Browser

Stato: packaging **alpha non firmato** configurato (electron-builder). La pipeline di
release completa (matrice Windows/macOS/Linux su tag `v*`, canali, auto-update) arriva
nella fase 09.

## Versione macOS eseguibile

### Opzione A — GitHub Actions (nessun Mac richiesto per il build)

Il workflow `.github/workflows/desktop-mac-build.yml` gira su un runner macOS a ogni
push che tocca il desktop (e manualmente con "Run workflow"):

1. vai su **GitHub → Actions → desktop-mac-build → ultimo run**;
2. scarica l'artifact **`businessbox-browser-mac`**;
3. dentro trovi `businessbox-browser-0.1.0-mac-arm64.dmg` (Apple Silicon),
   `...-mac-x64.dmg` (Intel) e i corrispondenti `.zip`.

### Opzione B — build locale su un Mac

```bash
pnpm install
pnpm exec turbo run build --filter=@businessbox/desktop
cd apps/desktop
pnpm build:mac        # produce dmg+zip in apps/desktop/release/
```

La cartella di output è **`apps/desktop/release/`** (gitignorata: i binari non si
committano).

### Primo avvio di un'app non firmata

L'alpha non è firmata né notarizzata (nessun certificato Apple Developer disponibile —
non viene simulato, come richiesto dal prompt 09). macOS Gatekeeper la bloccherà al
primo avvio:

- **tasto destro sull'app → Apri → Apri**, oppure
- `xattr -cr "/Applications/BusinessBox Browser.app"` e poi apertura normale.

Quando saranno disponibili certificati Developer ID, firma e notarization verranno
aggiunte alla pipeline (fase 09) senza cambiare i comandi.

## Altri sistemi operativi

Già configurati in `apps/desktop/electron-builder.yml` (si useranno nella fase 09):

```bash
pnpm build:win     # Windows NSIS (da eseguire su Windows)
pnpm build:linux   # AppImage + deb (da eseguire su Linux con rete libera)
```

## Note

- `appId` = `com.businessbox.browser`, allineato al branding centralizzato di
  `@businessbox/shared`.
- Icona: non ancora fornita; per ora viene usata l'icona di default di Electron
  (asset di branding attesi nelle fasi successive).
- L'ambiente di sviluppo remoto di questo repo non può scaricare i binari Electron
  (egress bloccata verso GitHub Releases), quindi il packaging va eseguito in CI o
  su una macchina locale.
