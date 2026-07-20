import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Repositories } from "../../data/types.js";

export interface AdminModuleDeps {
  repos: Repositories;
  /** Chiave admin (env). Se assente, le rotte admin restano protette e rispondono 503. */
  adminApiKey: string | null;
}

/** Feature flag statici dell'alpha (persistenza in DB nelle fasi successive). */
const FEATURE_FLAGS = [
  { key: "ai.enabled", enabled: true, description: "Assistente AI GLM 5.2" },
  { key: "sync.enabled", enabled: true, description: "Sincronizzazione cloud" },
];

const DESKTOP_VERSIONS = [
  { channel: "alpha" as const, version: "0.1.0", releasedAt: "2026-07-19T00:00:00.000Z" },
];

export function registerAdminRoutes(app: FastifyInstance, deps: AdminModuleDeps): void {
  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!deps.adminApiKey) {
      void reply.code(503).send({ error: "admin_disabled" });
      return false;
    }
    const provided = request.headers["x-admin-key"];
    if (typeof provided !== "string" || !safeEqual(provided, deps.adminApiKey)) {
      void reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return true;
  };

  app.get("/api/v1/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    const users = await deps.repos.users.list(50, 0);
    // Gli admin NON vedono il contenuto privato delle pagine né gli hash password.
    const rows = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        email: u.email,
        emailVerified: u.emailVerified,
        organizationId:
          (await deps.repos.organizations.listOrganizationsForUser(u.id))[0]?.id ?? "",
        createdAt: u.createdAt,
        deviceCount: (await deps.repos.devices.listForUser(u.id)).length,
      })),
    );
    return reply.send({ users: rows });
  });

  app.get("/api/v1/admin/organizations", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    const orgs = await deps.repos.organizations.list(50, 0);
    const rows = await Promise.all(
      orgs.map(async (o) => ({
        id: o.id,
        name: o.name,
        memberCount: (await deps.repos.organizations.listMembers(o.id)).length,
        planId: o.planId,
        createdAt: o.createdAt,
      })),
    );
    return reply.send({ organizations: rows });
  });

  app.get("/api/v1/admin/ai-usage", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    return reply.send({ usage: await deps.repos.aiUsage.summary(100) });
  });

  app.get("/api/v1/admin/audit", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    return reply.send({ entries: await deps.repos.audit.list(100, 0) });
  });

  app.get("/api/v1/admin/feature-flags", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    return reply.send({ flags: FEATURE_FLAGS });
  });

  app.get("/api/v1/admin/desktop-versions", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    return reply.send({ versions: DESKTOP_VERSIONS });
  });

  app.get("/api/v1/admin/health", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return reply;
    }
    const dbOk = await deps.repos.ping();
    return reply.send({
      services: [
        { service: "database", status: dbOk ? "ok" : "down" },
        { service: "api", status: "ok" },
      ],
    });
  });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
