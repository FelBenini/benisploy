import { z } from "zod";

export const ServerStatusSchema = z.enum(["online", "offline", "degraded"]);
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const ServerSchema = z.object({
  id: z.string().min(1).describe("Unique server identifier (ULID)"),
  name: z.string().min(1).max(128).describe("Human-readable server name"),
  address: z
    .string()
    .min(1)
    .describe("IP or hostname the node agent is reachable at"),
  sshPort: z
    .number()
    .int()
    .positive()
    .max(65535)
    .default(22)
    .describe("SSH port"),
  sshUser: z.string().min(1).default("root").describe("SSH login user"),
  sshPrivateKey: z
    .string()
    .min(1)
    .describe("SSH private key PEM (encrypted at rest)"),
  status: ServerStatusSchema.default("offline"),
  cpuCores: z.number().int().positive().describe("Number of CPU cores"),
  memoryBytes: z.number().positive().describe("Total system memory in bytes"),
  diskBytes: z.number().positive().describe("Total disk capacity in bytes"),
  labels: z
    .record(z.string(), z.string())
    .default({})
    .describe("Arbitrary key/value metadata"),
  lastHeartbeatAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateServerInputSchema = ServerSchema.pick({
  name: true,
  address: true,
  cpuCores: true,
  memoryBytes: true,
  diskBytes: true,
}).extend({
  labels: z.record(z.string(), z.string()).optional(),
  sshPort: z
    .number()
    .int()
    .positive()
    .max(65535)
    .default(22)
    .describe("SSH port"),
  sshUser: z.string().min(1).default("root").describe("SSH login user"),
});

export type CreateServerInput = z.infer<typeof CreateServerInputSchema>;

export type Server = z.infer<typeof ServerSchema>;

export const ServerStatusReportSchema = z.object({
  cpuPercent: z
    .number()
    .nonnegative()
    .max(100)
    .describe("CPU utilization percentage"),
  memoryUsed: z.number().nonnegative().describe("Used memory in bytes"),
  memoryTotal: z.number().positive().describe("Total memory in bytes"),
  diskUsed: z.number().nonnegative().describe("Used disk in bytes"),
  diskTotal: z.number().positive().describe("Total disk in bytes"),
  containerCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of running containers"),
  uptimeSeconds: z.number().nonnegative().describe("Server uptime in seconds"),
});

export type ServerStatusReport = z.infer<typeof ServerStatusReportSchema>;
