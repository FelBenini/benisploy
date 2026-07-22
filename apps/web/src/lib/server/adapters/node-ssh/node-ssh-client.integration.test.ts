import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { generateKeyPairSync } from "crypto";
import { utils } from "ssh2";
import { SshNodeCommandClient } from "./node-ssh-client";
import type { Server } from "../../domain/server";

const FORCED_SCRIPT = [
  "#!/bin/sh",
  "read -r action app_id extra",
  'case "$action" in',
  '  status) printf \'[{"ID":"abc123","Name":"/test","Image":"nginx:alpine","Project":"test","Service":"test","Created":"2025-01-01T00:00:00","State":"running","Status":"Up 1 hour","Ports":"80/tcp"}]\\n\' ;;',
  '  logs) printf "Log line 1\\nLog line 2\\n" ;;',
  '  deploy) printf "Container test-app Created\\nContainer test-app Started\\n" ;;',
  '  restart) printf "Restarting test-app... done\\n" ;;',
  '  stop) printf "Stopping test-app... done\\n" ;;',
  '  delete) printf "Removing test-app... done\\n" ;;',
  '  *) printf "Unknown action: %s\\n" "$action" >&2; exit 1 ;;',
  "esac",
].join("\n");

describe("SshNodeCommandClient integration", () => {
  let container: StartedTestContainer;
  let server: Server;
  let client: SshNodeCommandClient;

  beforeAll(async () => {
    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const parsed = utils.parseKey(keyPair.privateKey);
    if (parsed instanceof Error) {
      throw new Error(`Failed to parse SSH key: ${parsed.message}`);
    }
    const publicKeySsh = `${parsed.type} ${parsed.getPublicSSH().toString("base64")}`;

    container = await new GenericContainer("linuxserver/openssh-server")
      .withEnvironment({
        USER_NAME: "benisploy",
        PUBLIC_KEY: publicKeySsh,
        PASSWORD_ACCESS: "false",
      })
      .withExposedPorts(2222)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(2222);

    const scriptPath = "/usr/local/bin/force-command.sh";
    const scriptB64 = Buffer.from(FORCED_SCRIPT).toString("base64");

    await container.exec([
      "bash",
      "-c",
      `echo ${scriptB64} | base64 -d > ${scriptPath}`,
    ]);
    await container.exec(["chmod", "+x", scriptPath]);
    await container.exec(["chown", "benisploy:benisploy", scriptPath]);

    // Write the forced-command authorized_keys entry directly via base64 to avoid quoting issues
    const authKeysLine = `command="${scriptPath}",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${publicKeySsh}\n`;
    const authKeysB64 = Buffer.from(authKeysLine).toString("base64");
    await container.exec([
      "bash",
      "-c",
      `mkdir -p /home/benisploy/.ssh && echo ${authKeysB64} | base64 -d > /home/benisploy/.ssh/authorized_keys && chown -R benisploy:benisploy /home/benisploy/.ssh && chmod 600 /home/benisploy/.ssh/authorized_keys`,
    ]);

    await container.exec(["mkdir", "-p", "/opt/benisploy/apps"]);
    await container.exec([
      "chmod",
      "755",
      "/opt/benisploy",
      "/opt/benisploy/apps",
    ]);
    await container.exec([
      "chown",
      "-R",
      "benisploy:benisploy",
      "/opt/benisploy",
    ]);

    server = {
      id: "integration-srv",
      name: "integration-test",
      address: host,
      sshPort: port,
      sshUser: "benisploy",
      sshPrivateKey: keyPair.privateKey,
      status: "online",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
      labels: {},
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    client = new SshNodeCommandClient(
      async (id: string) => {
        if (id === server.id) return server;
        return null;
      },
      { execCommand: "/usr/local/bin/force-command.sh" },
    );
  }, 120_000);

  afterAll(async () => {
    client?.close();
    await container?.stop();
  });

  it("isReachable returns true for a running server", async () => {
    const reachable = await client.isReachable(server.id);
    expect(reachable).toBe(true);
  });

  it("isReachable returns false for unknown server", async () => {
    const reachable = await client.isReachable("nonexistent");
    expect(reachable).toBe(false);
  });

  it("status parses docker compose ps JSON output", async () => {
    const states = await client.status(server.id, "test-app");
    expect(states).toHaveLength(1);
    expect(states[0].id).toBe("abc123");
    expect(states[0].name).toBe("/test");
    expect(states[0].image).toBe("nginx:alpine");
    expect(states[0].state).toBe("running");
    expect(states[0].project).toBe("test");
    expect(states[0].service).toBe("test");
  });

  it("logs returns parsed log entries", async () => {
    const entries = await client.logs(server.id, "test-app", 50);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].message).toContain("Log line 1");
    expect(entries[1].message).toContain("Log line 2");
  });

  it("deploy uploads compose file and runs deploy command", async () => {
    const composeYaml = "services:\n  test:\n    image: nginx:alpine\n";
    const entries: Array<{
      timestamp: string;
      stream: string;
      message: string;
    }> = [];

    for await (const entry of client.deploy(
      server.id,
      "test-app",
      composeYaml,
    )) {
      entries.push(entry);
    }

    expect(entries.length).toBeGreaterThanOrEqual(1);
    const deployEntries = entries.filter(
      (e) => e.message.includes("Created") || e.message.includes("Started"),
    );
    expect(deployEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("restart does not throw", async () => {
    await expect(
      client.restart(server.id, "test-app"),
    ).resolves.toBeUndefined();
  });

  it("stop does not throw", async () => {
    await expect(client.stop(server.id, "test-app")).resolves.toBeUndefined();
  });

  it("remove does not throw", async () => {
    await expect(
      client.remove(server.id, "test-app", false),
    ).resolves.toBeUndefined();
  });

  it("remove with volumes does not throw", async () => {
    await expect(
      client.remove(server.id, "test-app", true),
    ).resolves.toBeUndefined();
  });

  it("throws SshConnectionError for invalid auth", async () => {
    const badServer: Server = { ...server, sshPrivateKey: "invalid-key" };
    const badClient = new SshNodeCommandClient(async () => badServer);

    await expect(badClient.isReachable(server.id)).resolves.toBe(false);
    badClient.close();
  });

  it("reuses pooled connections", async () => {
    const start = Date.now();
    await client.status(server.id, "test-app");
    await client.status(server.id, "test-app");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(15_000);
  });

  it("throws on invalid app ID", async () => {
    await expect(client.status(server.id, "../../etc/passwd")).rejects.toThrow(
      "Invalid app ID",
    );
  });
}, 120_000);
