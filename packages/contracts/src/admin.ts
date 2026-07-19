import { z } from "zod";

export const planSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  monthlyAiTokenLimit: z.number().int().nonnegative(),
  maxDevices: z.number().int().nonnegative(),
});
export type Plan = z.infer<typeof planSchema>;

export const adminUserRowSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  emailVerified: z.boolean(),
  organizationId: z.string(),
  createdAt: z.iso.datetime(),
  deviceCount: z.number().int().nonnegative(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminOrganizationRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
  planId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminOrganizationRow = z.infer<typeof adminOrganizationRowSchema>;

export const aiUsageSummarySchema = z.object({
  organizationId: z.string(),
  day: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;

export const queueStatsSchema = z.object({
  queue: z.string(),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type QueueStats = z.infer<typeof queueStatsSchema>;

export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string(),
});
export type FeatureFlag = z.infer<typeof featureFlagSchema>;

export const desktopVersionSchema = z.object({
  channel: z.enum(["alpha", "beta", "stable"]),
  version: z.string(),
  releasedAt: z.iso.datetime(),
});
export type DesktopVersion = z.infer<typeof desktopVersionSchema>;

export const auditLogRowSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditLogRow = z.infer<typeof auditLogRowSchema>;

export const serviceHealthSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded", "down"]),
  detail: z.string().optional(),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
