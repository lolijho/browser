/**
 * Packaging desktop (electron-builder).
 * Branding allineato a packages/shared/src/branding.ts — se cambia lì, cambia anche qui.
 *
 * Config in JS e non in YAML perché la firma macOS deve adattarsi a ciò che è
 * realmente disponibile nell'ambiente di build:
 *
 * - con un certificato Developer ID → firma reale + hardened runtime, e
 *   notarization se ci sono anche le credenziali Apple;
 * - senza certificato → firma AD-HOC come oggi (obbligatoria su Apple Silicon:
 *   senza alcuna firma macOS segnala l'app come "danneggiata").
 *
 * Non esiste una via di mezzo simulata: o la firma è reale, o è dichiaratamente
 * ad-hoc. Vedi docs/DESKTOP_RELEASE.md per la procedura completa.
 */

/**
 * Certificato fornito esplicitamente: file .p12 (CSC_LINK) o nome identità
 * (CSC_NAME). È la via usata in CI.
 */
const hasExplicitCertificate = Boolean(
  process.env["CSC_LINK"] || process.env["CSC_KEY_PASSWORD"] || process.env["CSC_NAME"],
);

/**
 * Cerca nel keychain un'identità **Developer ID Application**.
 *
 * La distinzione è sostanziale, non formale:
 * - "Apple Development" firma per il test locale su dispositivi registrati;
 *   un'app così firmata viene RIFIUTATA da Gatekeeper sugli altri Mac;
 * - "Developer ID Application" è l'unica valida per distribuire fuori dal Mac
 *   App Store.
 *
 * electron-builder, lasciato a sé, auto-scopre qualunque identità di firma:
 * userebbe volentieri un certificato di sviluppo producendo un pacchetto che
 * *sembra* firmato ma non funziona per gli utenti. Qui lo impediamo.
 */
function findDeveloperIdIdentity() {
  if (process.platform !== "darwin") {
    return false;
  }
  try {
    const { execFileSync } = require("node:child_process");
    const output = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.includes("Developer ID Application");
  } catch {
    // Keychain non interrogabile: trattato come "nessun certificato".
    return false;
  }
}

const hasSigningCertificate = hasExplicitCertificate || findDeveloperIdIdentity();

/** Notarization con Apple ID + password specifica per app. */
const hasAppleIdCredentials = Boolean(
  process.env["APPLE_ID"] &&
  process.env["APPLE_APP_SPECIFIC_PASSWORD"] &&
  process.env["APPLE_TEAM_ID"],
);

/** Notarization con chiave App Store Connect (preferibile in CI: non scade come la password). */
const hasApiKeyCredentials = Boolean(
  process.env["APPLE_API_KEY"] &&
  process.env["APPLE_API_KEY_ID"] &&
  process.env["APPLE_API_ISSUER"],
);

const canNotarize = hasSigningCertificate && (hasAppleIdCredentials || hasApiKeyCredentials);

// Diagnostica esplicita: una release "firmata" che silenziosamente non lo è
// sarebbe il difetto peggiore possibile in questa parte del sistema.
if (hasSigningCertificate && !canNotarize) {
  console.warn(
    "[electron-builder] Certificato presente ma credenziali di notarization assenti: " +
      "l'app sarà firmata e NON notarizzata. Al primo avvio Gatekeeper la bloccherà comunque. " +
      "Imposta APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, oppure APPLE_API_KEY + " +
      "APPLE_API_KEY_ID + APPLE_API_ISSUER.",
  );
}
if (!hasSigningCertificate) {
  // Disattiva l'auto-discovery del keychain: è l'unico meccanismo che
  // electron-builder onora davvero (`mac.identity: null` viene ignorato).
  // Senza questo verrebbe usato un certificato "Apple Development".
  process.env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false";
  console.warn(
    "[electron-builder] Nessun certificato 'Developer ID Application': build con firma AD-HOC. " +
      "Un eventuale certificato 'Apple Development' presente nel keychain NON viene usato: " +
      "serve per il test locale e verrebbe rifiutato da Gatekeeper sugli altri Mac. " +
      "Gli utenti dovranno usare `xattr -cr` al primo avvio. Vedi docs/DESKTOP_RELEASE.md.",
  );
}

/**
 * Ripara la firma ad-hoc prodotta da electron-builder.
 *
 * Con `CSC_IDENTITY_AUTO_DISCOVERY=false` electron-builder produce un bundle il
 * cui sigillo è incompleto: manca `Contents/_CodeSignature/CodeResources` e
 * `codesign --verify` fallisce con "code has no resources but signature
 * indicates they must be present". macOS, sommando la quarantena del download,
 * dichiara l'app **danneggiata** e si rifiuta di aprirla — anche con
 * click-destro → Apri. È il difetto che rendeva inutilizzabile la 0.1.0.
 *
 * Qui ri-firmiamo ad-hoc l'intero bundle in modo che il sigillo sia completo.
 * L'app resta non notarizzata (serve un Developer ID), quindi al primo avvio
 * comparirà "impossibile verificare lo sviluppatore": è un avviso superabile,
 * a differenza di "danneggiata" che è un blocco.
 *
 * `--deep` è sconsigliato da Apple per le firme di distribuzione, ma qui non
 * stiamo distribuendo con identità: è il modo corretto di sigillare un bundle
 * ad-hoc già assemblato. Sul percorso con certificato reale questo hook NON
 * viene eseguito.
 */
async function repairAdHocSignature(context) {
  if (context.electronPlatformName !== "darwin" || hasSigningCertificate) {
    return;
  }
  const { execFileSync } = require("node:child_process");
  const { join } = require("node:path");
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  // Verifica immediata: una firma ad-hoc rotta deve far fallire la build, non
  // arrivare agli utenti come nella 0.1.0.
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
  console.info(`[electron-builder] Firma ad-hoc riparata e verificata: ${appPath}`);
}

module.exports = {
  afterSign: repairAdHocSignature,
  appId: "com.businessbox.browser",
  productName: "BusinessBox Browser",
  executableName: "businessbox-browser",

  directories: {
    output: "release",
    buildResources: "build",
  },

  // electron-vite bundla tutto in out/ (main CJS, preload, renderer):
  // nessuna dipendenza node_modules necessaria a runtime.
  files: ["out/**", "!out/**/*.map"],

  asar: true,
  // I preload girano in sandbox: il loro `require` ristretto non riesce a
  // caricare i chunk relativi da DENTRO l'asar. Estraiamo i preload su disco
  // reale mantenendo l'asar per il resto dell'app.
  asarUnpack: ["out/preload/**"],
  npmRebuild: false,
  nodeGypRebuild: false,

  // Nome letterale: ${name} risolverebbe "@businessbox/desktop" e la "/" romperebbe il percorso.
  artifactName: "businessbox-browser-${version}-${os}-${arch}.${ext}",

  mac: {
    category: "public.app-category.productivity",
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    // L'hardened runtime è obbligatorio per la notarization, ma richiede una
    // firma reale: attivarlo su una build ad-hoc produrrebbe un'app più
    // fragile senza alcun beneficio.
    hardenedRuntime: hasSigningCertificate,
    // `identity: null` forza la firma ad-hoc e disattiva l'auto-discovery:
    // senza questo electron-builder userebbe un certificato "Apple Development"
    // trovato nel keychain, producendo un pacchetto che sembra firmato ma che
    // gli altri Mac rifiutano.
    ...(hasSigningCertificate ? {} : { identity: null }),
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.inherit.plist",
    // `notarize: false` è esplicito: senza credenziali non tentiamo nulla.
    notarize: canNotarize
      ? hasAppleIdCredentials
        ? { teamId: process.env["APPLE_TEAM_ID"] }
        : true
      : false,
    gatekeeperAssess: false,
  },

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // La verifica della firma degli update NON viene disabilitata: con un
    // certificato reale l'update verifica il publisher.
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "businessbox-browser-${version}-${arch}-setup.${ext}",
  },

  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Network",
    maintainer: "BusinessBox",
  },

  // Auto-update predisposto (electron-updater). Canale allineato al branding
  // (alpha). Il feed reale si imposta al momento del rilascio; in CI si usa
  // `--publish never`. La verifica di firma/integrità resta sempre attiva.
  publish: [
    {
      provider: "generic",
      url: "https://updates.businessbox.example/${channel}",
      channel: "alpha",
    },
  ],
};
