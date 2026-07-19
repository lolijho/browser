import { z } from "zod";

export const emailSchema = z.email().max(320);
export const passwordSchema = z.string().min(10).max(200);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().min(1).max(120).optional(),
  deviceName: z.string().min(1).max(120).optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: z.string().min(1).max(120).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(10).max(4096),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(10).max(4096),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).max(4096),
  password: passwordSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

/** Coppia di token restituita a login/registrazione/refresh. */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshTokenExpiresAt: z.iso.datetime(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: emailSchema,
    emailVerified: z.boolean(),
  }),
  organizationId: z.string().min(1),
  deviceId: z.string().min(1),
  tokens: authTokensSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/** Claims dell'access token (breve durata). */
export const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: emailSchema,
  org: z.string().min(1),
  device: z.string().min(1),
  type: z.literal("access"),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export const deviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  revoked: z.boolean(),
});
export type Device = z.infer<typeof deviceSchema>;
