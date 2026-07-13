import { z } from "zod";

export const AppStatusSchema = z.enum([
  "pending",
  "deploying",
  "healthy",
  "degraded",
  "removed",
]);

export type AppStatus = z.infer<typeof AppStatusSchema>;

export const AppSchema = z.object({
  id: z.string().min(1).describe("Unique app identifier (ULID)"),
  name: z.string().min(1).max(64).describe("Human-readable app name"),
  serverId: z.string().min(1).describe("Server this app is deployed on"),
  status: AppStatusSchema.default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type App = z.infer<typeof AppSchema>;
