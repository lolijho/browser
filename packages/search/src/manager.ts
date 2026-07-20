import type { SearchEngine, SearchSettings } from "@businessbox/contracts";
import { searchSettingsSchema } from "@businessbox/contracts";
import { BUILT_IN_SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE_ID } from "./engines.js";
import { classifyOmniboxInput } from "./omnibox.js";
import { buildSearchUrl, validateSearchUrlTemplate } from "./template.js";

/** Default iniziale della modalità privata (prompt 03): Brave Search. */
export const DEFAULT_PRIVATE_ENGINE_ID = "brave";

export interface EngineSelectionContext {
  workspaceId?: string;
  privateMode?: boolean;
  /** Motore "solo per questa ricerca": non viene mai persistito. */
  engineOverrideId?: string;
}

export interface EngineMutationResult {
  ok: boolean;
  reason?: string;
  engine?: SearchEngine;
}

export interface AddCustomEngineInput {
  name: string;
  keyword: string;
  searchUrlTemplate: string;
  suggestUrlTemplate?: string;
  iconUrl?: string;
  scope?: "global" | "workspace";
  workspaceId?: string;
}

/**
 * Gestore multi-motore (prompt 03): default globale/privato/per-workspace,
 * keyword e alias, motori custom con validazioni severe, OpenSearch,
 * import/export. Puro e senza Electron; la persistenza arriva con la fase 04.
 */
export class ConfigurableSearchEngineManager {
  private readonly engines = new Map<string, SearchEngine>();
  private globalDefaultId = DEFAULT_SEARCH_ENGINE_ID;
  private privateDefaultId = DEFAULT_PRIVATE_ENGINE_ID;
  private readonly workspaceDefaults = new Map<string, string>();

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    for (const engine of BUILT_IN_SEARCH_ENGINES) {
      this.engines.set(engine.id, engine);
    }
  }

  // --- elenco e selezione ---

  listEngines(): SearchEngine[] {
    return [...this.engines.values()];
  }

  getEngineById(engineId: string): SearchEngine | undefined {
    return this.engines.get(engineId);
  }

  getGlobalDefault(): SearchEngine {
    return this.mustGet(this.globalDefaultId);
  }

  getPrivateDefault(): SearchEngine {
    return this.mustGet(this.privateDefaultId);
  }

  /** Il workspace eredita il default globale se non ha un proprio default. */
  getDefaultFor(context: EngineSelectionContext = {}): SearchEngine {
    if (context.privateMode) {
      return this.getPrivateDefault();
    }
    if (context.workspaceId) {
      const overrideId = this.workspaceDefaults.get(context.workspaceId);
      if (overrideId) {
        const engine = this.engines.get(overrideId);
        if (engine?.enabled) {
          return engine;
        }
      }
    }
    return this.getGlobalDefault();
  }

  setDefault(
    scope: "global" | "workspace" | "private",
    engineId: string,
    workspaceId?: string,
  ): EngineMutationResult {
    const engine = this.engines.get(engineId);
    if (!engine || !engine.enabled) {
      return { ok: false, reason: "Motore inesistente o disabilitato" };
    }
    if (scope === "global") {
      this.globalDefaultId = engineId;
    } else if (scope === "private") {
      this.privateDefaultId = engineId;
    } else {
      if (!workspaceId) {
        return { ok: false, reason: "workspaceId richiesto per il default di workspace" };
      }
      this.workspaceDefaults.set(workspaceId, engineId);
    }
    return { ok: true, engine };
  }

  clearWorkspaceDefault(workspaceId: string): void {
    this.workspaceDefaults.delete(workspaceId);
  }

  // --- keyword e alias ---

  /** Risolve una keyword (`:g`), preferendo i motori del workspace corrente. */
  resolveKeyword(keyword: string, workspaceId?: string): SearchEngine | null {
    const enabled = this.listEngines().filter((e) => e.enabled);
    const inWorkspace = enabled.find(
      (e) => e.scope === "workspace" && e.workspaceId === workspaceId && e.keyword === keyword,
    );
    if (inWorkspace) {
      return inWorkspace;
    }
    return enabled.find((e) => e.scope === "global" && e.keyword === keyword) ?? null;
  }

  /** Risolve un alias (`/google`, `/duck`) su id o nome. */
  resolveAlias(alias: string): SearchEngine | null {
    const normalized = alias.toLowerCase();
    const special: Record<string, string> = { duck: "duckduckgo" };
    const targetId = special[normalized] ?? normalized;
    const byId = this.engines.get(targetId);
    if (byId?.enabled) {
      return byId;
    }
    return (
      this.listEngines().find(
        (e) => e.enabled && e.name.toLowerCase().replaceAll(/\s+/g, "") === normalized,
      ) ?? null
    );
  }

  // --- motori custom / OpenSearch ---

  addCustomEngine(input: AddCustomEngineInput): EngineMutationResult {
    return this.insertEngine({ ...input, type: "custom" });
  }

  addOpenSearchEngine(input: {
    name: string;
    keyword: string;
    searchUrlTemplate: string;
  }): EngineMutationResult {
    const duplicate = this.listEngines().find(
      (e) => e.searchUrlTemplate === input.searchUrlTemplate,
    );
    if (duplicate) {
      return { ok: false, reason: "Motore già installato", engine: duplicate };
    }
    return this.insertEngine({ ...input, scope: "global", type: "opensearch" });
  }

  updateCustomEngine(engineId: string, patch: Partial<AddCustomEngineInput>): EngineMutationResult {
    const existing = this.engines.get(engineId);
    if (!existing || existing.type === "built-in") {
      return { ok: false, reason: "Solo i motori custom possono essere modificati" };
    }
    const merged: AddCustomEngineInput = {
      name: patch.name ?? existing.name,
      keyword: patch.keyword ?? existing.keyword,
      searchUrlTemplate: patch.searchUrlTemplate ?? existing.searchUrlTemplate,
      scope: patch.scope ?? existing.scope,
      ...((patch.suggestUrlTemplate ?? existing.suggestUrlTemplate)
        ? { suggestUrlTemplate: patch.suggestUrlTemplate ?? existing.suggestUrlTemplate }
        : {}),
      ...((patch.iconUrl ?? existing.iconUrl)
        ? { iconUrl: patch.iconUrl ?? existing.iconUrl }
        : {}),
      ...((patch.workspaceId ?? existing.workspaceId)
        ? { workspaceId: patch.workspaceId ?? existing.workspaceId }
        : {}),
    };
    const validation = this.validateEngineInput(merged, engineId);
    if (validation) {
      return { ok: false, reason: validation };
    }
    const updated: SearchEngine = {
      ...existing,
      ...merged,
      scope: merged.scope ?? existing.scope,
      updatedAt: this.now(),
    };
    this.engines.set(engineId, updated);
    return { ok: true, engine: updated };
  }

  removeEngine(engineId: string): EngineMutationResult {
    const engine = this.engines.get(engineId);
    if (!engine) {
      return { ok: false, reason: "Motore inesistente" };
    }
    if (engine.type === "built-in") {
      return { ok: false, reason: "I motori preinstallati non possono essere rimossi" };
    }
    this.engines.delete(engineId);
    if (this.globalDefaultId === engineId) {
      this.globalDefaultId = DEFAULT_SEARCH_ENGINE_ID;
    }
    if (this.privateDefaultId === engineId) {
      this.privateDefaultId = DEFAULT_PRIVATE_ENGINE_ID;
    }
    for (const [workspaceId, defaultId] of this.workspaceDefaults) {
      if (defaultId === engineId) {
        this.workspaceDefaults.delete(workspaceId);
      }
    }
    return { ok: true };
  }

  // --- generazione URL e navigazione ---

  buildSearchUrlWith(engineId: string, query: string): string {
    return buildSearchUrl(this.mustGet(engineId).searchUrlTemplate, query);
  }

  /**
   * Risolve l'input dell'omnibox rispettando le precedenze del prompt 03:
   * override esplicito → keyword `:x` → alias `/nome` → URL/dominio → ricerca
   * col default del contesto. La selezione temporanea non viene persistita.
   */
  resolveNavigation(rawInput: string, context: EngineSelectionContext = {}): string {
    const input = rawInput.trim();

    if (context.engineOverrideId && this.engines.has(context.engineOverrideId)) {
      return this.buildSearchUrlWith(context.engineOverrideId, input);
    }

    const colonMatch = /^:(\S+)\s+(.+)$/.exec(input);
    if (colonMatch) {
      const engine = this.resolveKeyword(colonMatch[1] ?? "", context.workspaceId);
      if (engine) {
        return buildSearchUrl(engine.searchUrlTemplate, colonMatch[2] ?? "");
      }
    }

    const aliasMatch = /^\/(\S+)\s+(.+)$/.exec(input);
    if (aliasMatch) {
      const engine = this.resolveAlias(aliasMatch[1] ?? "");
      if (engine) {
        return buildSearchUrl(engine.searchUrlTemplate, aliasMatch[2] ?? "");
      }
    }

    const classified = classifyOmniboxInput(input);
    if (classified.kind === "url") {
      return classified.url;
    }
    return buildSearchUrl(this.getDefaultFor(context).searchUrlTemplate, classified.query);
  }

  // --- impostazioni ---

  getSettingsSnapshot(): SearchSettings {
    return {
      engines: this.listEngines(),
      globalDefaultEngineId: this.globalDefaultId,
      privateDefaultEngineId: this.privateDefaultId,
      workspaceDefaults: Object.fromEntries(this.workspaceDefaults),
    };
  }

  exportSettings(): string {
    return JSON.stringify(this.getSettingsSnapshot(), null, 2);
  }

  /** Import: i built-in restano canonici; custom/opensearch vengono rivalidati. */
  importSettings(json: string): EngineMutationResult {
    let parsed: SearchSettings;
    try {
      parsed = searchSettingsSchema.parse(JSON.parse(json));
    } catch {
      return { ok: false, reason: "Formato impostazioni non valido" };
    }
    for (const engine of parsed.engines) {
      if (engine.type === "built-in") {
        continue;
      }
      const validation = this.validateEngineInput(engine, engine.id);
      if (validation) {
        return { ok: false, reason: `Motore "${engine.name}": ${validation}` };
      }
    }
    for (const engine of parsed.engines) {
      if (engine.type !== "built-in") {
        this.engines.set(engine.id, engine);
      }
    }
    if (this.engines.has(parsed.globalDefaultEngineId)) {
      this.globalDefaultId = parsed.globalDefaultEngineId;
    }
    if (this.engines.has(parsed.privateDefaultEngineId)) {
      this.privateDefaultId = parsed.privateDefaultEngineId;
    }
    for (const [workspaceId, engineId] of Object.entries(parsed.workspaceDefaults)) {
      if (this.engines.has(engineId)) {
        this.workspaceDefaults.set(workspaceId, engineId);
      }
    }
    return { ok: true };
  }

  // --- internals ---

  private insertEngine(
    input: AddCustomEngineInput & { type: "custom" | "opensearch" },
  ): EngineMutationResult {
    const validation = this.validateEngineInput(input);
    if (validation) {
      return { ok: false, reason: validation };
    }
    const timestamp = this.now();
    const engine: SearchEngine = {
      id: crypto.randomUUID(),
      name: input.name,
      keyword: input.keyword,
      searchUrlTemplate: input.searchUrlTemplate,
      ...(input.suggestUrlTemplate ? { suggestUrlTemplate: input.suggestUrlTemplate } : {}),
      ...(input.iconUrl ? { iconUrl: input.iconUrl } : {}),
      type: input.type,
      scope: input.scope ?? "global",
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.engines.set(engine.id, engine);
    return { ok: true, engine };
  }

  private validateEngineInput(
    input: Pick<
      AddCustomEngineInput,
      "name" | "keyword" | "searchUrlTemplate" | "suggestUrlTemplate" | "scope" | "workspaceId"
    >,
    ignoreEngineId?: string,
  ): string | null {
    if (!input.name.trim()) {
      return "Nome obbligatorio";
    }
    if (!/^\S+$/.test(input.keyword)) {
      return "La keyword non può contenere spazi";
    }
    const templateVerdict = validateSearchUrlTemplate(input.searchUrlTemplate);
    if (!templateVerdict.valid) {
      return templateVerdict.reason ?? "Template non valido";
    }
    if (input.suggestUrlTemplate) {
      const suggestVerdict = validateSearchUrlTemplate(input.suggestUrlTemplate);
      if (!suggestVerdict.valid) {
        return `Template suggerimenti: ${suggestVerdict.reason}`;
      }
    }
    const scope = input.scope ?? "global";
    const clash = this.listEngines().find(
      (e) =>
        e.id !== ignoreEngineId &&
        e.keyword === input.keyword &&
        e.scope === scope &&
        (scope === "global" || e.workspaceId === input.workspaceId),
    );
    if (clash) {
      return `Keyword "${input.keyword}" già usata da ${clash.name} in questo scope`;
    }
    return null;
  }

  private mustGet(engineId: string): SearchEngine {
    const engine = this.engines.get(engineId);
    if (!engine) {
      throw new Error(`Motore di ricerca inesistente: ${engineId}`);
    }
    return engine;
  }
}
