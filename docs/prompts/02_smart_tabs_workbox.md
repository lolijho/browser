# Prompt 02 — Smart Tabs, sidebar e WorkBox

Leggi i file di progetto e implementa la caratteristica distintiva del browser.

## Obiettivo

La barra superiore deve contenere soltanto:

- la pagina attiva;
- massimo tre pagine pinned.

Tutte le altre pagine devono apparire nella sidebar e venire organizzate in WorkBox.

## Modello dati locale iniziale

Definisci almeno:

```ts
interface PageCard {
  id: string;
  workspaceId: string;
  workBoxId: string | null;
  parentPageId: string | null;
  url: string;
  title: string;
  domain: string;
  state: "hot" | "warm" | "cold";
  pinned: boolean;
  keepAlive: boolean;
  dirtyState: boolean;
  sessionPartition: string;
  scrollPosition: number | null;
  openedAt: string;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}
```

Crea anche `Workspace` e `WorkBox` con UUID, nome, descrizione, ordinamento e timestamp.

## Tab Lifecycle Manager

Implementa regole deterministiche:

1. La nuova pagina diventa attiva.
2. La precedente resta in alto solo se pinned.
3. Le non pinned vengono mostrate nella sidebar.
4. Non permettere più di tre pinned.
5. Se si prova a fissare una quarta pagina, chiedere quale sostituire.
6. Chiudere dalla barra non deve necessariamente eliminare la PageCard: per default deve archiviarla lateralmente.
7. Fornire una seconda azione esplicita per chiusura definitiva.

## Stati

### Hot

- pagina attiva o pinned;
- renderer vivo;
- massimo quattro per default.

### Warm

- renderer vivo ma non visibile;
- massimo sei per default;
- passa a cold dopo timeout configurabile.

### Cold

- renderer distrutto;
- conserva metadati sufficienti per il ripristino;
- riapre con la stessa partizione di sessione.

## Dirty state

Inietta uno script isolato che rilevi prudentemente modifiche a:

- input non sensibili;
- textarea;
- contenteditable;
- form.

Non leggere mai campi password, carte, CVV o token.

Se `dirtyState=true`:

- non distruggere automaticamente il renderer;
- imposta `keepAlive` temporaneo;
- mostra un badge;
- richiedi conferma prima della chiusura definitiva.

## Sidebar

Implementa:

- workspace switcher;
- elenco WorkBox;
- PageCard virtualizzate;
- ricerca rapida;
- drag and drop tra WorkBox;
- menu contestuale;
- contatori;
- sezioni Recenti, Pinned, Da organizzare e Archiviate.

Azioni minime:

- apri;
- pin/unpin;
- keep alive;
- sposta;
- archivia;
- elimina definitivamente;
- duplica;
- copia URL.

## Criteri di accettazione

- Non compaiono mai più di una attiva e tre pinned in alto.
- Dieci pagine aperte sono tutte recuperabili dalla sidebar.
- Una pagina cold viene ricreata nella sessione corretta.
- Le pagine dirty non vengono distrutte senza conferma.
- Drag and drop aggiorna realmente il modello dati.
- Il browser resta navigabile con sidebar chiusa.
- Testa lifecycle, limite pinned, restore e dirty state.
