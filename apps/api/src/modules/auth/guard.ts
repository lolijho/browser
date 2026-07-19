import type { FastifyReply, FastifyRequest } from "fastify";
import type { AccessTokenClaims } from "@businessbox/contracts";
import type { Repositories } from "../../data/types.js";
import { verifyAccessToken, type TokenConfig } from "./tokens.js";

export interface AuthContext {
  claims: AccessTokenClaims;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/**
 * Guard di autenticazione: valida il bearer access token e VERIFICA
 * server-side l'appartenenza dell'utente all'organizzazione dei claims.
 * È la difesa centrale contro IDOR / abuso multi-tenant.
 */
export function createAuthGuard(repos: Repositories, tokenConfig: TokenConfig) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      await reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const claims = await verifyAccessToken(token, tokenConfig);
    if (!claims) {
      await reply.code(401).send({ error: "unauthorized" });
      return;
    }
    // Appartenenza verificata a ogni richiesta: un token valido per un'org non
    // consente l'accesso a un'org di cui l'utente non è più membro.
    const member = await repos.organizations.isMember(claims.org, claims.sub);
    if (!member) {
      await reply.code(403).send({ error: "forbidden" });
      return;
    }
    const device = await repos.devices.findById(claims.device);
    if (device?.revoked) {
      await reply.code(401).send({ error: "device_revoked" });
      return;
    }
    request.auth = { claims };
  };
}
