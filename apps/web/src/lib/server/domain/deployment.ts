import { z } from "zod";
import { AppSpecSchema } from "./app-spec";

export const DeploymentStatusSchema = z.enum([
  "pending",
  "planning",
  "awaiting_confirmation",
  "executing",
  "verifying",
  "healthy",
  "failed",
  "rolled_back",
]);

export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const DeploymentSchema = z.object({
  id: z.string().min(1).describe("Unique deployment identifier (ULID)"),
  appId: z.string().min(1).describe("App this deployment belongs to"),
  serverId: z.string().min(1).describe("Server this deployment runs on"),
  status: DeploymentStatusSchema.default("pending"),
  appSpec: AppSpecSchema.describe("Snapshot of the AppSpec at deployment time"),
  version: z
    .number()
    .int()
    .positive()
    .describe("Monotonic version number for rollback"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Deployment = z.infer<typeof DeploymentSchema>;

export const PlanSchema = z.object({
  serverId: z.string().min(1),
  allocatedPort: z.number().int().positive().max(65535),
  subdomain: z
    .string()
    .min(1)
    .describe("e.g. 'myapp' → 'myapp.yourdomain.com'"),
  resourceBudget: z.object({
    cpus: z.string(),
    memoryMB: z.number().int().positive(),
  }),
  estimatedDiskMB: z.number().int().nonnegative(),
});

export type Plan = z.infer<typeof PlanSchema>;
