# Build desktop — BusinessBox Browser

Stato: packaging **alpha non firmato** configurato (electron-builder). La pipeline di
release completa (matrice Windows/macOS/Linux su tag `v*`, canali, auto-update) arriva
nella fase 09.

## Puntare l'app all'API deployata (obbligatorio per le build distribuite)

Il default del branding è `http://localhost:3000`. Una build fatta senza indicare
l'URL dell'API cercherà quindi il backend **sulla macchina dell'utente**: login e
AI non funzioneranno mai contro un'API realmente deployata (es. su Coolify).

Imposta `BUSINESSBOX_API_URL` **al momento della build**: il valore viene compilato
nel bundle del processo principale.

```bash
BUSINESSBOX_API_URL=https://api.tuodominio.it pnpm build:mac
```

Deve coincidere con il `PUBLIC_API_URL` configurato in Coolify (vedi
`docs/COOLIFY_DEPLOY.md`). Regole applicate dal codice
(`apps/desktop/src/main/config/api-url.ts`):

- precedenza: variabile a runtime `BUSINESSBOX_API_URL` → valore compilato → branding;
- sono accettati solo `http`/`https`; un valore non valido viene **ignorato** (l'app
  non deve fallire l'avvio per una configurazione sbagliata);
- la barra finale viene rimossa, un prefisso di percorso viene conservato;
- `http://` verso un host non locale produce un warning `api.insecure_url`: su quel
  canale viaggiano access token, quindi in produzione usa sempre HTTPS.

All'avvio il log `api.base_url` indica l'URL effettivamente in uso: è il primo posto
da guardare se il login non funziona.

> Nota CORS: le chiamate autenticate partono dal **processo principale**, non dal
> renderer, quindi non sono soggette a CORS. `CORS_ALLOWED_ORIGINS` serve al sito e
> alla dashboard admin, non all'app desktop.

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

Senza certificato la build è firmata **ad-hoc**: è il minimo indispensabile perché
macOS la consideri eseguibile su Apple Silicon, ma non basta a Gatekeeper. Al primo
avvio serve:

- **tasto destro sull'app → Apri → Apri**, oppure
- `xattr -cr "/Applications/BusinessBox Browser.app"` e poi apertura normale.

> La 0.1.0 distribuita non era nemmeno apribile così: la firma ad-hoc prodotta da
> electron-builder era **incompleta** (mancava `Contents/_CodeSignature/CodeResources`)
> e macOS la dichiarava _danneggiata_, un blocco che il click-destro non supera.
> Ora l'hook `afterSign` in `apps/desktop/electron-builder.cjs` ri-firma il bundle e
> **verifica** il risultato: se il sigillo non è valido la build fallisce, invece di
> arrivare agli utenti.

## Firma come sviluppatore (Developer ID) e notarization

La configurazione è già pronta: appena i certificati esistono, `hardenedRuntime`,
entitlements e notarization si attivano da soli. Quello che segue va fatto **una volta**.

### 1. Iscrizione all'Apple Developer Program

Serve l'abbonamento a pagamento (99 USD/anno): <https://developer.apple.com/programs/>.
Un account Apple gratuito permette solo certificati _Apple Development_, che servono al
test locale e **non** alla distribuzione.

> Verifica cosa hai già: `security find-identity -v -p codesigning`
> Se compare solo `Apple Development: …`, non è sufficiente. Serve
> `Developer ID Application: …`. La build **rifiuta di usare** un certificato di
> sviluppo: firmarci un pacchetto produrrebbe un'app che sembra firmata ma che
> Gatekeeper rifiuta sulle macchine degli utenti — un difetto che si scoprirebbe
> solo dopo la distribuzione.

### 2. Creare il certificato Developer ID Application

Da Xcode: **Settings → Accounts → Manage Certificates → + → Developer ID Application**.
In alternativa dal portale: **Certificates, IDs & Profiles → Certificates → +**.

### 3. Build locale firmata

Con il certificato nel keychain non serve altro: la configurazione lo rileva.

```bash
pnpm --filter @businessbox/desktop build
cd apps/desktop && pnpm exec electron-builder --mac --publish never
```

Per la notarization servono anche le credenziali Apple:

```bash
export APPLE_ID="tuo@appleid.it"
export APPLE_TEAM_ID="XXXXXXXXXX"          # Membership details sul portale
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # appleid.apple.com → Sicurezza
```

La password specifica per app si crea su <https://appleid.apple.com> (sezione Sicurezza):
**non** è la password del tuo Apple ID e va trattata come un segreto.

Se il certificato è presente ma mancano le credenziali di notarization, la build lo
dichiara con un avviso: l'app risulterà firmata ma ancora bloccata da Gatekeeper.

### 4. Build firmata in CI (consigliato per le release)

Esporta il certificato dal Portachiavi come `.p12` (con password), poi convertilo:

```bash
base64 -i certificato.p12 | pbcopy
```

Aggiungi questi **GitHub Secrets** al repository (Settings → Secrets and variables → Actions):

| Secret                        | Contenuto                              |
| ----------------------------- | -------------------------------------- |
| `MAC_CERTIFICATE_P12`         | il `.p12` in base64 (incollato sopra)  |
| `MAC_CERTIFICATE_PASSWORD`    | password scelta durante l'esportazione |
| `APPLE_ID`                    | il tuo Apple ID                        |
| `APPLE_TEAM_ID`               | il Team ID (10 caratteri)              |
| `APPLE_APP_SPECIFIC_PASSWORD` | password specifica per app             |

Il workflow `desktop-mac-build.yml` li usa se presenti, importa il certificato in un
keychain temporaneo del runner, **verifica che sia di tipo Developer ID** (altrimenti
fallisce) e al termine controlla la firma con `codesign --verify` e `spctl`.
Senza segreti il workflow continua a produrre build ad-hoc, senza fallire.

In alternativa alla password specifica per app puoi usare una chiave App Store Connect
(`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`): non scade e in CI è preferibile.

### 5. Verificare che sia andata davvero a buon fine

```bash
codesign -dv --verbose=4 "BusinessBox Browser.app"   # atteso: Authority=Developer ID Application
codesign --verify --deep --strict "BusinessBox Browser.app"
spctl -a -vvv -t exec "BusinessBox Browser.app"      # atteso: accepted, source=Notarized Developer ID
xcrun stapler validate "BusinessBox Browser.app"     # il "ticket" di notarization è allegato
```

Se `spctl` dice `accepted` ma la fonte **non** è `Notarized Developer ID`, l'app è
firmata ma non notarizzata: gli utenti vedranno ancora l'avviso di Gatekeeper.

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
