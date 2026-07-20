import { z } from "zod";

export const healthStatusSchema = z.enum(["ok", "degraded", "down"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string().min(1),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const livenessResponseSchema = z.object({
  status: z.literal("ok"),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessCheckStateSchema = z.enum(["ok", "failed", "skipped"]);
export type ReadinessCheckState = z.infer<typeof readinessCheckStateSchema>;

export const readinessResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.record(z.string(), readinessCheckStateSchema),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
