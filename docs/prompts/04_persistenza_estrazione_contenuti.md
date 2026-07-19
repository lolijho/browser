# Prompt 04 — Persistenza locale, estrazione e memoria delle pagine

## Obiettivo

Rendere il browser local-first: workspace, WorkBox, PageCard e metadati devono sopravvivere al riavvio. Le pagine devono diventare risorse ricercabili, non semplici URL.

## SQLite

Usa SQLite con migrazioni versionate. Valuta `better-sqlite3` e configura correttamente la ricompilazione per Electron.

Tabelle minime:

- local_settings
- workspaces
- workboxes
- page_cards
- page_snapshots
- page_navigation_history
- search_engines
- workspace_search_settings
- tags
- page_tags
- entities
- page_entities
- notes
- tasks
- ai_conversations
- ai_messages
- ai_runs
- classification_rules
- sync_queue
- sync_conflicts

## Page snapshot

Conserva:

- URL finale e canonical URL;
- titolo;
- dominio;
- favicon;
- meta description;
- lingua;
- headings;
- testo leggibile;
- Open Graph;
- JSON-LD pubblico;
- autore e data, quando rilevabili;
- link principali;
- testo delle tabelle in forma strutturata;
- content hash;
- normalized URL hash;
- scroll position;
- screenshot locale opzionale.

## Estrazione

Usa Mozilla Readability o soluzione equivalente in ambiente isolato.

- Non eseguire script estratti.
- Sanitizza HTML e testo.
- Non leggere password, cookie, token, localStorage, header Authorization o campi sensibili.
- Non bloccare la navigazione mentre estrai.
- Debounce gli aggiornamenti per SPA.
- Non ripetere l'elaborazione AI se `contentHash` è invariato.

## Screenshot

Usa `capturePage`:

- anteprima WebP o PNG;
- qualità configurabile;
- storage locale;
- disabilitato in modalità privata;
- per-page `allowScreenshot`;
- comando per oscurare/eliminare screenshot;
- nessuna sincronizzazione automatica senza consenso.

## Ricerca locale

Implementa full-text search su:

- titolo;
- URL;
- dominio;
- testo estratto;
- riassunto;
- tag;
- entità;
- note.

Filtri:

- workspace;
- WorkBox;
- data;
- dominio;
- stato;
- tag;
- pinned;
- sensitivity.

## Ripristino

Al riavvio:

- ripristina ultimo workspace;
- ricrea la pagina attiva;
- ricrea pinned entro il limite;
- lascia le altre cold;
- preserva WorkBox e ordinamento;
- usa la stessa session partition.

## Criteri di accettazione

- Riavviando l'app non si perdono PageCard e WorkBox.
- La ricerca trova contenuto estratto dalle pagine.
- Il content hash evita duplicazioni.
- Screenshot e testo rispettano i flag privacy.
- Le pagine cold non consumano renderer.
- Migrazioni, backup locale e gestione database corrotto sono documentati e testati.
