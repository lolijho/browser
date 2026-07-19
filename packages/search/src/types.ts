/**
 * Modello dati dei motori di ricerca (prompt 03).
 * Il SearchEngineManager completo viene implementato nella fase 03;
 * il modello è definito qui perché la shell (fase 01) instrada già
 * le ricerche dietro questa astrazione.
 */
export interface SearchEngine {
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
