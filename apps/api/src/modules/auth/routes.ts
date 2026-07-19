import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import {
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from "@businessbox/contracts";
import type { Repositories } from "../../data/types.js";
import { AuthError, type AuthService } from "./service.js";

export interface AuthModuleDeps {
  repos: Repositories;
  authService: AuthService;
  requireAuth: preHandlerHookHandler;
}

const AUTH_ERROR_STATUS: Record<AuthError["code"], number> = {
  email_taken: 409,
  invalid_credentials: 401,
  invalid_refresh: 401,
  refresh_reused: 401,
  not_found: 404,
};

export function registerAuthRoutes(app: FastifyInstance, deps: AuthModuleDeps): void {
  const handle = async (fn: () => Promise<unknown>, reply: FastifyReply) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(AUTH_ERROR_STATUS[error.code]).send({ error: error.code });
      }
      throw error;
    }
  };

  app.post("/api/v1/auth/register", async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    return handle(async () => {
      const session = await deps.authService.register(parsed.data);
      await deps.repos.audit.append(
        auditRecord(session.user.id, session.organizationId, "auth.register"),
      );
      return reply.code(201).send(session);
    }, reply);
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    return handle(async () => {
      const session = await deps.authService.login(parsed.data);
      await deps.repos.audit.append(
        auditRecord(session.user.id, session.organizationId, "auth.login"),
      );
      return reply.send(session);
    }, reply);
  });

  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const parsed = refreshRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    return handle(
      async () => reply.send(await deps.authService.refresh(parsed.data.refreshToken)),
      reply,
    );
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const parsed = logoutRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    await deps.authService.logout(parsed.data.refreshToken);
    return reply.code(204).send();
  });

  // --- rotte autenticate ---

  app.get("/api/v1/users/me", { preHandler: deps.requireAuth }, async (request, reply) => {
    const claims = request.auth!.claims;
    return reply.send({ id: claims.sub, email: claims.email, organizationId: claims.org });
  });

  app.get("/api/v1/devices", { preHandler: deps.requireAuth }, async (request, reply) => {
    const devices = await deps.repos.devices.listForUser(request.auth!.claims.sub);
    return reply.send({ devices });
  });

  app.post(
    "/api/v1/devices/:id/revoke",
    { preHandler: deps.requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await deps.authService.revokeDevice(request.auth!.claims.sub, id);
      if (!ok) {
        return reply.code(404).send({ error: "not_found" });
      }
      await deps.repos.audit.append(
        auditRecord(request.auth!.claims.sub, request.auth!.claims.org, "device.revoke"),
      );
      return reply.code(204).send();
    },
  );
}

function auditRecord(actorId: string, organizationId: string, action: string) {
  return {
    id: randomUUID(),
    organizationId,
    actorId,
    action,
    targetType: "auth",
    targetId: null,
    createdAt: new Date().toISOString(),
  };
}
