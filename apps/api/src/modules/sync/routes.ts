import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { syncPullRequestSchema, syncPushRequestSchema } from "@businessbox/contracts";
import type { Repositories } from "../../data/types.js";
import { SyncEngine } from "./engine.js";

export interface SyncModuleDeps {
  repos: Repositories;
  requireAuth: preHandlerHookHandler;
}

export function registerSyncRoutes(app: FastifyInstance, deps: SyncModuleDeps): void {
  const engine = new SyncEngine({ repos: deps.repos });

  app.post("/api/v1/sync/push", { preHandler: deps.requireAuth }, async (request, reply) => {
    const parsed = syncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    // L'org proviene SEMPRE dai claims verificati, mai dal corpo della richiesta.
    const organizationId = request.auth!.claims.org;
    return reply.send(await engine.push(organizationId, parsed.data.mutations));
  });

  app.post("/api/v1/sync/pull", { preHandler: deps.requireAuth }, async (request, reply) => {
    const parsed = syncPullRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const organizationId = request.auth!.claims.org;
    return reply.send(await engine.pull(organizationId, parsed.data.since, parsed.data.limit));
  });

  app.get("/api/v1/sync/conflicts", { preHandler: deps.requireAuth }, async (request, reply) => {
    const conflicts = await deps.repos.sync.listConflicts(request.auth!.claims.org);
    return reply.send({ conflicts });
  });
}
