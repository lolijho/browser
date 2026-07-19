import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { accessTokenClaimsSchema, type AccessTokenClaims } from "@businessbox/contracts";

export interface TokenConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface IssuedRefreshToken {
  /** Token opaco consegnato al client (mai persistito in chiaro). */
  token: string;
  /** Hash SHA-256 conservato lato server. */
  tokenHash: string;
  expiresAt: Date;
}

/** Un refresh token è un valore casuale ad alta entropia; il server ne conserva solo l'hash. */
export function generateRefreshToken(now: Date, ttlSeconds: number): IssuedRefreshToken {
  const token = randomBytes(48).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "type">,
  config: TokenConfig,
  now: Date,
): Promise<IssuedAccessToken> {
  const expiresAt = new Date(now.getTime() + config.accessTtlSeconds * 1000);
  const token = await new SignJWT({
    email: claims.email,
    org: claims.org,
    device: claims.device,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey(config.accessSecret));
  return { token, expiresAt };
}

export async function verifyAccessToken(
  token: string,
  config: TokenConfig,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config.accessSecret));
    return accessTokenClaimsSchema.parse(normalizeClaims(payload));
  } catch {
    return null;
  }
}

function normalizeClaims(payload: JWTPayload): Record<string, unknown> {
  return {
    sub: payload.sub,
    email: payload["email"],
    org: payload["org"],
    device: payload["device"],
    type: payload["type"],
  };
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
