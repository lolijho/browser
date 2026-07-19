import { z } from "zod";

export const releaseChannelSchema = z.enum(["alpha", "beta", "stable"]);

/**
 * Informazioni di runtime dell'app desktop, esposte al renderer
 * tramite IPC validato (nessun accesso diretto a `process` dal renderer).
 */
export const appInfoSchema = z.object({
  productName: z.string().min(1),
  releaseChannel: releaseChannelSchema,
  appVersion: z.string().min(1),
  electronVersion: z.string().min(1),
  chromeVersion: z.string().min(1),
  nodeVersion: z.string().min(1),
});
export type AppInfo = z.infer<typeof appInfoSchema>;
