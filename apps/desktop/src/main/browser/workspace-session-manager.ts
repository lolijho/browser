import { workspaceSessionPartition } from "@businessbox/shared";

/**
 * Gestisce le sessioni Chromium per workspace: ogni workspace usa la partizione
 * persistente `persist:workspace-<id>`, quindi cookie/storage/login sono isolati.
 *
 * La factory è iniettabile per poter testare senza Electron: in produzione
 * crea la Session reale e vi applica i permission handler deny-by-default.
 */
export class WorkspaceSessionManager<TSession> {
  private readonly cache = new Map<string, TSession>();

  constructor(private readonly sessionFactory: (partition: string) => TSession) {}

  getPartition(workspaceId: string): string {
    return workspaceSessionPartition(workspaceId);
  }

  getSession(workspaceId: string): TSession {
    const partition = this.getPartition(workspaceId);
    const cached = this.cache.get(partition);
    if (cached) {
      return cached;
    }
    const created = this.sessionFactory(partition);
    this.cache.set(partition, created);
    return created;
  }

  /** Partizioni istanziate finora (diagnostica e test). */
  getKnownPartitions(): readonly string[] {
    return [...this.cache.keys()];
  }
}
