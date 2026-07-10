import { z } from "zod";
import { AppSpecSchema } from "./app-spec";
import {
  CreateServerInputSchema,
  ServerSchema,
  ServerStatusReportSchema,
} from "./server";
import { DeploymentSchema, PlanSchema } from "./deployment";

export interface ToolDef {
  name: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  requiresConfirmation: boolean;
}

export const tools = {
  resolve_app: {
    name: "resolve_app",
    description:
      "Match user intent to a template or infer a Compose spec from a repo URL",
    input: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("query"),
        query: z
          .string()
          .min(1)
          .describe("Free-text app search, e.g. 'nextcloud' or 'blog'"),
      }),
      z.object({
        type: z.literal("repo"),
        repoUrl: z
          .string()
          .url()
          .describe("Git repository URL to infer a spec from"),
      }),
    ]),
    output: AppSpecSchema,
    requiresConfirmation: false,
  } satisfies ToolDef,

  plan_deploy: {
    name: "plan_deploy",
    description:
      "Compute resource allocation, port, and subdomain for a given app spec on a target server",
    input: z.object({
      appSpec: AppSpecSchema,
      serverId: z.string().min(1),
    }),
    output: PlanSchema,
    requiresConfirmation: false,
  } satisfies ToolDef,

  create_app: {
    name: "create_app",
    description:
      "Execute a confirmed deploy plan — deploys the app to the target server",
    input: z.object({
      planId: z
        .string()
        .min(1)
        .describe("ID of the plan returned by plan_deploy"),
    }),
    output: DeploymentSchema,
    requiresConfirmation: true,
  } satisfies ToolDef,

  get_app: {
    name: "get_app",
    description: "Get details for a single app by ID",
    input: z.object({
      appId: z.string().min(1),
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      serverId: z.string(),
      currentDeployment: DeploymentSchema.optional(),
      createdAt: z.string().datetime(),
    }),
    requiresConfirmation: false,
  } satisfies ToolDef,

  list_apps: {
    name: "list_apps",
    description: "List all apps across all servers",
    input: z.object({}),
    output: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        serverId: z.string(),
        status: z.string(),
        createdAt: z.string().datetime(),
      }),
    ),
    requiresConfirmation: false,
  } satisfies ToolDef,

  delete_app: {
    name: "delete_app",
    description:
      "Tear down an app and optionally remove its persistent volumes",
    input: z.object({
      appId: z.string().min(1),
      removeVolumes: z
        .boolean()
        .default(false)
        .describe("Also delete persistent volumes"),
    }),
    output: z.object({ deleted: z.literal(true) }),
    requiresConfirmation: true,
  } satisfies ToolDef,

  set_env: {
    name: "set_env",
    description: "Set or update an environment variable on a running app",
    input: z.object({
      appId: z.string().min(1),
      key: z.string().min(1).describe("Environment variable name"),
      value: z
        .string()
        .describe("Environment variable value (empty string to clear)"),
    }),
    output: z.object({ applied: z.literal(true) }),
    requiresConfirmation: true,
  } satisfies ToolDef,

  restart_app: {
    name: "restart_app",
    description: "Restart a container or stack without changing its config",
    input: z.object({
      appId: z.string().min(1),
    }),
    output: z.object({ restarted: z.literal(true) }),
    requiresConfirmation: false,
  } satisfies ToolDef,

  get_logs: {
    name: "get_logs",
    description: "Fetch recent log lines from a deployed app",
    input: z.object({
      appId: z.string().min(1),
      lines: z
        .number()
        .int()
        .positive()
        .max(5000)
        .default(100)
        .describe("Number of recent log lines to fetch"),
      stream: z
        .enum(["stdout", "stderr"])
        .optional()
        .describe("Filter to a specific output stream"),
    }),
    output: z.object({
      lines: z.array(
        z.object({
          timestamp: z.string().datetime(),
          stream: z.enum(["stdout", "stderr"]),
          message: z.string(),
        }),
      ),
    }),
    requiresConfirmation: false,
  } satisfies ToolDef,

  register_server: {
    name: "register_server",
    description: "Register a new managed server in the control plane",
    input: CreateServerInputSchema,
    output: ServerSchema,
    requiresConfirmation: false,
  } satisfies ToolDef,

  get_server_status: {
    name: "get_server_status",
    description: "Get current CPU, RAM, and disk utilization for a server",
    input: z.object({
      serverId: z.string().min(1),
    }),
    output: ServerStatusReportSchema,
    requiresConfirmation: false,
  } satisfies ToolDef,
} as const;

export type ToolName = keyof typeof tools;
