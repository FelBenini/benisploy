import { describe, it, expect } from "vitest";
import { load } from "js-yaml";
import { generateComposeYaml } from "./index";

function validSpec(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: "test-app",
    image: "nginx:alpine",
    envVars: {},
    ports: [],
    volumeMounts: [],
    ...overrides,
  };
}

describe("generateComposeYaml", () => {
  it("generates minimal compose file with image and env vars", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "nginx-test",
        image: "nginx:alpine",
        envVars: { FOO: "bar" },
        ports: [{ container: 80, protocol: "tcp" }],
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("nginx-test");
    expect(yaml).toContain("nginx:alpine");
    expect(yaml).toContain("FOO: bar");
  });

  it("includes resource limits when specified", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "resource-test",
        image: "redis:7",
        resourceLimits: { cpus: "0.5", memoryMB: 256 },
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("cpus: '0.5'");
    expect(yaml).toContain("memory: 256M");
  });

  it("includes health check configuration", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "health-test",
        image: "nginx:alpine",
        healthCheck: {
          test: ["CMD", "curl", "-f", "http://localhost"],
          interval: 30,
          timeout: 10,
          retries: 3,
          startPeriod: 5,
        },
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("curl");
    expect(yaml).toContain("interval: 30s");
    expect(yaml).toContain("timeout: 10s");
    expect(yaml).toContain("retries: 3");
    expect(yaml).toContain("start_period: 5s");
  });

  it("includes volume mounts", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "volume-test",
        image: "postgres:16",
        volumeMounts: [
          { source: "pgdata", target: "/var/lib/postgresql/data", mode: "rw" },
        ],
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("pgdata:/var/lib/postgresql/data");
  });

  it("declares named volumes at top level", () => {
    const yaml = generateComposeYaml(
      validSpec({
        volumeMounts: [
          { source: "pgdata", target: "/var/lib/postgresql/data", mode: "rw" },
        ],
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    const parsed = load(yaml) as Record<string, unknown>;
    expect(parsed.volumes).toBeDefined();
    expect((parsed.volumes as Record<string, unknown>).pgdata).toBeNull();
  });

  it("does not declare bind-mounted paths at top level", () => {
    const yaml = generateComposeYaml(
      validSpec({
        volumeMounts: [
          { source: "/host/path", target: "/container/path", mode: "rw" },
          { source: "./relative/path", target: "/container/path", mode: "rw" },
        ],
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    const parsed = load(yaml) as Record<string, unknown>;
    expect(parsed.volumes).toBeUndefined();
  });

  it("handles compose overrides with deep merge", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "override-test",
        image: "nginx:alpine",
        envVars: { BASE: "val" },
        composeOverrides: `
services:
  override-test:
    environment:
      OVERRIDDEN: "yes"
`,
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("OVERRIDDEN");
    expect(yaml).toContain("BASE: val");
  });

  it("uses build context instead of image when provided", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "build-test",
        buildContext: "./myapp",
        image: undefined,
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("build: ./myapp");
    expect(yaml).not.toContain("image:");
  });

  it("sanitizes container names", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "my app!",
        image: "nginx:alpine",
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("my-app-");
  });

  it("adds Traefik labels when baseDomain is provided", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "myapp",
        image: "nginx:alpine",
        ports: [{ container: 8080, protocol: "tcp" }],
      }) as Parameters<typeof generateComposeYaml>[0],
      { baseDomain: "example.com" },
    );

    expect(yaml).toContain("traefik.enable=true");
    expect(yaml).toContain("Host(`myapp.example.com`)");
    expect(yaml).toContain("entrypoints=websecure");
    expect(yaml).toContain("certresolver=letsencrypt");
    expect(yaml).toContain("server.port=8080");
  });

  it("defaults to port 80 in Traefik labels when no ports are exposed", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "myapp",
        image: "nginx:alpine",
      }) as Parameters<typeof generateComposeYaml>[0],
      { baseDomain: "example.com" },
    );

    expect(yaml).toContain("server.port=80");
  });

  it("does not add Traefik labels when baseDomain is omitted", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "myapp",
        image: "nginx:alpine",
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).not.toContain("traefik");
  });

  it("handles UDP port mapping", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "udp-test",
        image: "myapp",
        ports: [{ container: 53, protocol: "udp" }],
      }) as Parameters<typeof generateComposeYaml>[0],
    );

    expect(yaml).toContain("53/udp");
  });

  it("generates valid YAML parseable by js-yaml", () => {
    const yaml = generateComposeYaml(
      validSpec({
        name: "parse-test",
        image: "nginx:alpine",
        envVars: { FOO: "bar" },
        ports: [{ container: 80, protocol: "tcp" }],
        volumeMounts: [{ source: "data", target: "/data", mode: "rw" }],
        resourceLimits: { cpus: "0.5", memoryMB: 256 },
        healthCheck: {
          test: ["CMD", "curl", "-f", "http://localhost"],
          interval: 30,
          timeout: 10,
          retries: 3,
          startPeriod: 5,
        },
      }) as Parameters<typeof generateComposeYaml>[0],
      { baseDomain: "example.com" },
    );

    const parsed = load(yaml) as Record<string, unknown>;
    expect(parsed.services).toBeDefined();
    const svc = (parsed.services as Record<string, unknown>)[
      "parse-test"
    ] as Record<string, unknown>;
    expect(svc.image).toBe("nginx:alpine");
  });
});
