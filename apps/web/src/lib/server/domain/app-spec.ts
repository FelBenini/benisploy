import { z } from "zod";

export const HealthCheckSchema = z.object({
  test: z
    .array(z.string())
    .describe(
      "Command to run, e.g. ['CMD-SHELL', 'curl -f http://localhost || exit 1']",
    ),
  interval: z
    .number()
    .int()
    .positive()
    .default(30)
    .describe("Seconds between checks"),
  timeout: z
    .number()
    .int()
    .positive()
    .default(10)
    .describe("Seconds before a check times out"),
  retries: z
    .number()
    .int()
    .nonnegative()
    .default(3)
    .describe("Consecutive failures needed to mark unhealthy"),
  startPeriod: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Grace period before checks begin"),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const ResourceLimitsSchema = z.object({
  cpus: z.string().describe("CPU limit in Docker format, e.g. '0.5' or '1.0'"),
  memoryMB: z.number().int().positive().describe("Memory limit in megabytes"),
});

export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const VolumeMountSchema = z.object({
  source: z.string().describe("Host path or named volume"),
  target: z.string().describe("Container mount path"),
  mode: z.enum(["ro", "rw"]).default("rw"),
});

export type VolumeMount = z.infer<typeof VolumeMountSchema>;

export const PortMappingSchema = z.object({
  container: z.number().int().positive().describe("Container port"),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

export type PortMapping = z.infer<typeof PortMappingSchema>;

export const AppSpecSchema = z
  .object({
    name: z.string().min(1).max(64).describe("Human-readable app name"),
    image: z.string().optional().describe("Docker image, e.g. 'nginx:alpine'"),
    buildContext: z
      .string()
      .optional()
      .describe("URL or path to a build context (git repo or tarball)"),
    composeOverrides: z
      .string()
      .optional()
      .describe(
        "Raw docker-compose YAML snippet merged into the final compose file",
      ),
    envVars: z
      .record(z.string(), z.string())
      .default({})
      .describe("Environment variables injected into the container"),
    ports: z
      .array(PortMappingSchema)
      .default([])
      .describe("Ports the container listens on"),
    volumeMounts: z
      .array(VolumeMountSchema)
      .default([])
      .describe("Persistent storage mounts"),
    resourceLimits: ResourceLimitsSchema.optional().describe(
      "CPU/memory constraints",
    ),
    healthCheck: HealthCheckSchema.optional().describe(
      "Container health check configuration",
    ),
  })
  .refine(
    (spec) => spec.image !== undefined || spec.buildContext !== undefined,
    { message: "Either 'image' or 'buildContext' must be provided" },
  );

export type AppSpec = z.infer<typeof AppSpecSchema>;
