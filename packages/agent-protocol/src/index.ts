import { z } from "zod";

// ── AppSpec (wire format, mirrors the control-plane domain type) ──────────

export const AgentHealthCheckSchema = z.object({
  test: z.array(z.string()),
  interval: z.number().int().positive().default(30),
  timeout: z.number().int().positive().default(10),
  retries: z.number().int().nonnegative().default(3),
  startPeriod: z.number().int().nonnegative().default(0),
});

export const AgentResourceLimitsSchema = z.object({
  cpus: z.string(),
  memoryMB: z.number().int().positive(),
});

export const AgentVolumeMountSchema = z.object({
  source: z.string(),
  target: z.string(),
  mode: z.enum(["ro", "rw"]).default("rw"),
});

export const AgentPortMappingSchema = z.object({
  container: z.number().int().positive(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

export const AgentAppSpecSchema = z.object({
  name: z.string().min(1).max(64),
  image: z.string().optional(),
  buildContext: z.string().optional(),
  composeOverrides: z.string().optional(),
  envVars: z.record(z.string(), z.string()).default({}),
  ports: z.array(AgentPortMappingSchema).default([]),
  volumeMounts: z.array(AgentVolumeMountSchema).default([]),
  resourceLimits: AgentResourceLimitsSchema.optional(),
  healthCheck: AgentHealthCheckSchema.optional(),
}).refine(
  (spec) => spec.image !== undefined || spec.buildContext !== undefined,
  { message: "Either 'image' or 'buildContext' must be provided" },
);

// ── Message envelope ──────────────────────────────────────────────────────

export const MessageTypeSchema = z.enum([
  "deploy",
  "deploy_response",
  "get_status",
  "status_response",
  "stream_logs",
  "log_entry",
  "heartbeat",
  "heartbeat_ack",
  "error",
]);

export const MessageEnvelopeSchema = z.object({
  type: MessageTypeSchema,
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.unknown(),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

// ── deploy / deploy_response ─────────────────────────────────────────────

export const DeployRequestSchema = MessageEnvelopeSchema.extend({
  type: z.literal("deploy"),
  payload: z.object({
    deploymentId: z.string().min(1),
    appSpec: AgentAppSpecSchema,
    composeContent: z.string().optional(),
  }),
});

export const DeployResponseSchema = MessageEnvelopeSchema.extend({
  type: z.literal("deploy_response"),
  payload: z.object({
    accepted: z.boolean(),
    deploymentId: z.string(),
  }),
});

// ── get_status / status_response ──────────────────────────────────────────

export const GetStatusRequestSchema = MessageEnvelopeSchema.extend({
  type: z.literal("get_status"),
  payload: z.object({}),
});

const ContainerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: z.enum(["running", "stopped", "exited", "paused"]),
  portMappings: z.array(z.object({ host: z.number(), container: z.number() })),
});

export const StatusResponseSchema = MessageEnvelopeSchema.extend({
  type: z.literal("status_response"),
  payload: z.object({
    cpuPercent: z.number().min(0).max(100),
    memoryUsed: z.number().nonnegative(),
    memoryTotal: z.number().positive(),
    diskUsed: z.number().nonnegative(),
    diskTotal: z.number().positive(),
    containers: z.array(ContainerInfoSchema),
    uptimeSeconds: z.number().nonnegative(),
  }),
});

// ── stream_logs / log_entry ──────────────────────────────────────────────

export const StreamLogsRequestSchema = MessageEnvelopeSchema.extend({
  type: z.literal("stream_logs"),
  payload: z.object({
    appId: z.string().min(1),
    lines: z.number().int().positive().max(5000).default(100),
    follow: z.boolean().default(false),
  }),
});

export const LogEntrySchema = MessageEnvelopeSchema.extend({
  type: z.literal("log_entry"),
  payload: z.object({
    timestamp: z.string().datetime(),
    stream: z.enum(["stdout", "stderr"]),
    message: z.string(),
    deploymentId: z.string().optional(),
  }),
});

// ── heartbeat / heartbeat_ack ────────────────────────────────────────────

export const HeartbeatSchema = MessageEnvelopeSchema.extend({
  type: z.literal("heartbeat"),
  payload: z.object({
    serverId: z.string(),
    hostname: z.string(),
    cpuPercent: z.number().min(0).max(100),
    memoryUsed: z.number().nonnegative(),
    memoryTotal: z.number().positive(),
    diskUsed: z.number().nonnegative(),
    diskTotal: z.number().positive(),
    uptimeSeconds: z.number().nonnegative(),
  }),
});

export const HeartbeatAckSchema = MessageEnvelopeSchema.extend({
  type: z.literal("heartbeat_ack"),
  payload: z.object({
    timestamp: z.string().datetime(),
  }),
});

// ── error ─────────────────────────────────────────────────────────────────

export const ErrorSchema = MessageEnvelopeSchema.extend({
  type: z.literal("error"),
  payload: z.object({
    code: z.string(),
    message: z.string(),
    originalMessageId: z.string(),
  }),
});

// ── Discriminated union for parsing any message ──────────────────────────

export const AnyMessageSchema = z.discriminatedUnion("type", [
  DeployRequestSchema,
  DeployResponseSchema,
  GetStatusRequestSchema,
  StatusResponseSchema,
  StreamLogsRequestSchema,
  LogEntrySchema,
  HeartbeatSchema,
  HeartbeatAckSchema,
  ErrorSchema,
]);

export type AnyMessage = z.infer<typeof AnyMessageSchema>;
