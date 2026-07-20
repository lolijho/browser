# Prompt 03 — Gestore multi-motore di ricerca

Leggi il progetto esistente. Sostituisci qualsiasi dipendenza fissa da Google con un sistema configurabile simile ai browser moderni.

## Obiettivo

Consentire all'utente di scegliere Google, Brave Search o altri motori:

- globalmente;
- per workspace;
- per modalità privata;
- temporaneamente per una singola ricerca;
- tramite keyword;
- tramite motori personalizzati;
- tramite rilevamento OpenSearch.

## Motori preinstallati

Crea configurazioni verificabili e aggiornabili per:

- Google — keyword `g`
- Brave Search — keyword `br`
- Bing — keyword `b`
- DuckDuckGo — keyword `d`
- Startpage — keyword `s`
- Qwant — keyword `q`
- Ecosia — keyword `e`

Template indicativi:

```text
https://www.google.com/search?q=%s
https://search.brave.com/search?q=%s
https://www.bing.com/search?q=%s
https://duckduckgo.com/?q=%s
https://www.startpage.com/sp/search?query=%s
https://www.qwant.com/?q=%s
https://www.ecosia.org/search?q=%s
```

Verifica i template durante l'implementazione e centralizzali in un registry, senza spargerli nel codice.

## Regole

- Default globale iniziale: Google.
- Default privato iniziale: Brave Search.
- Il workspace può ereditare il default globale oppure impostarne uno proprio.
- Una selezione temporanea vale solo per la ricerca corrente.
- Nessuno scraping automatico delle SERP.
- Una ricerca normale costruisce l'URL e lo apre nel `WebContentsView`.

## SearchEngineManager

Definisci un'interfaccia con metodi per:

- elenco motori;
- motore globale;
- motore privato;
- motore workspace;
- aggiunta, modifica e rimozione custom;
- risoluzione keyword;
- generazione URL;
- rilevamento OpenSearch;
- import/export impostazioni.

Modello minimo:

```ts
interface SearchEngine {
  id: string;
  name: string;
  keyword: string;
  searchUrlTemplate: string;
  suggestUrlTemplate?: string;
  iconUrl?: string;
  type: "built-in" | "custom" | "opensearch";
  scope: "global" | "workspace";
  workspaceId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## Omnibox

Mostra l'icona del motore selezionato a sinistra. Il menu deve offrire:

- usa solo questa volta;
- imposta come default globale;
- imposta come default workspace;
- gestisci motori;
- aggiungi motore.

Supporta:

```text
:g query
:br query
:b query
:d query
```

Supporta anche alias:

```text
/google query
/brave query
/bing query
/duck query
```

Implementa modalità keyword + Tab, ad esempio:

```text
amazon.it + Tab
youtube.com + Tab
github.com + Tab
```

## Motori personalizzati

Campi:

- nome;
- keyword;
- URL ricerca con `%s`;
- URL suggerimenti opzionale;
- icona;
- scope;
- abilitato.

Validazioni:

- HTTPS, salvo localhost in sviluppo;
- `%s` obbligatorio;
- blocca `javascript:`, `data:`, `file:`;
- keyword univoca nello scope;
- nessuna API key nel template;
- query sempre codificata con `encodeURIComponent`.

## OpenSearch

Rileva in una pagina:

```html
<link rel="search" type="application/opensearchdescription+xml" ... />
```

Non installare automaticamente. Mostra una proposta e richiedi conferma.

## Suggerimenti

- Disabilitati fino al consenso.
- Sempre disabilitati in modalità privata.
- Debounce e cancellazione richieste.
- Non inviare URL, comandi interni o input identificato come sensibile.
- Mescola in modo distinguibile suggerimenti remoti, cronologia, WorkBox e preferiti.

## Intent parser

Ordine:

1. comando browser;
2. comando AI;
3. keyword motore;
4. URL completo;
5. dominio;
6. ricerca locale;
7. ricerca web.

Non inviare una normale ricerca web a GLM 5.2.

## Criteri di accettazione

- È possibile cambiare tra Google e Brave senza riavvio.
- Un workspace mantiene il proprio motore.
- `:br crm per pmi` apre Brave Search.
- La query successiva torna al default.
- Un motore custom valido funziona.
- Template pericolosi vengono rifiutati.
- OpenSearch viene rilevato ma non installato senza conferma.
- Testa parser, precedenze, encoding e impostazioni workspace.
