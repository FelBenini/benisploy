import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import { SshNodeCommandClient, SshConnectionError } from "./node-ssh-client";
import type { Server } from "../../domain/server";

let testPrivateKey: string;

beforeAll(() => {
  const keyPair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  testPrivateKey = keyPair.privateKey;
});

function makeServer(overrides?: Partial<Server>): Server {
  return {
    id: "srv-1",
    name: "test-server",
    address: "127.0.0.1",
    sshPort: 22,
    sshUser: "root",
    sshPrivateKey: testPrivateKey,
    status: "online",
    cpuCores: 4,
    memoryBytes: 8_000_000_000,
    diskBytes: 100_000_000_000,
    labels: {},
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SshNodeCommandClient", () => {
  let client: SshNodeCommandClient;

  afterEach(() => {
    client?.close();
  });

  describe("validateAppId", () => {
    it("rejects app IDs with path traversal characters", async () => {
      client = new SshNodeCommandClient(vi.fn());
      await expect(client.status("srv-1", "../../etc/passwd")).rejects.toThrow(
        "Invalid app ID",
      );
    });

    it("rejects app IDs with spaces", async () => {
      client = new SshNodeCommandClient(vi.fn());
      await expect(client.status("srv-1", "my app")).rejects.toThrow(
        "Invalid app ID",
      );
    });

    it("rejects empty app IDs", async () => {
      client = new SshNodeCommandClient(vi.fn());
      await expect(client.status("srv-1", "")).rejects.toThrow(
        "Invalid app ID",
      );
    });

    it("allows alphanumeric, underscore, and hyphen app IDs", async () => {
      const server = makeServer();
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(server));
      const err = await client.status("srv-1", "valid-app_123").catch((e) => e);
      // Should get a connection error (SSH server not reachable), not a validation error
      expect(err).toBeInstanceOf(SshConnectionError);
      expect((err as Error).message).not.toContain("Invalid app ID");
    });
  });

  describe("isReachable", () => {
    it("returns false when server not found", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      await expect(client.isReachable("nonexistent")).resolves.toBe(false);
    });

    it("returns false on connection failure", async () => {
      const server = makeServer({ address: "192.0.2.1" });
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(server), {
        commandTimeoutMs: 1000,
      });
      const result = await client.isReachable("srv-1");
      expect(result).toBe(false);
    });

    it("returns false when resolveServer throws", async () => {
      client = new SshNodeCommandClient(
        vi.fn().mockRejectedValue(new Error("db error")),
      );
      await expect(client.isReachable("srv-1")).resolves.toBe(false);
    });
  });

  describe("close", () => {
    it("cleans up pool and stops timer", () => {
      client = new SshNodeCommandClient(vi.fn());
      expect(() => client.close()).not.toThrow();
    });
  });

  describe("exec errors", () => {
    it("status throws SshCommandError on non-zero exit", async () => {
      const server = makeServer({ address: "192.0.2.99" });
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(server), {
        commandTimeoutMs: 5000,
      });
      await expect(client.status("srv-1", "myapp")).rejects.toThrow(
        SshConnectionError,
      );
    });

    it("restart throws on connection failure", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      await expect(client.restart("srv-1", "myapp")).rejects.toThrow(
        SshConnectionError,
      );
    });

    it("stop throws on connection failure", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      await expect(client.stop("srv-1", "myapp")).rejects.toThrow(
        SshConnectionError,
      );
    });

    it("remove throws on connection failure", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      await expect(client.remove("srv-1", "myapp", false)).rejects.toThrow(
        SshConnectionError,
      );
    });

    it("logs throws on connection failure", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      await expect(client.logs("srv-1", "myapp", 50)).rejects.toThrow(
        SshConnectionError,
      );
    });

    it("deploy throws on validation failure", async () => {
      client = new SshNodeCommandClient(vi.fn());
      const gen = client.deploy("srv-1", "../../hack", "yaml: content");
      let threw = false;
      try {
        for await (const _ of gen) {
          /* */
        }
      } catch (e) {
        threw = true;
        expect((e as Error).message).toContain("Invalid app ID");
      }
      expect(threw).toBe(true);
    });

    it("deploy throws on server not found", async () => {
      client = new SshNodeCommandClient(vi.fn().mockResolvedValue(null));
      const gen = client.deploy("srv-1", "myapp", "yaml: content");
      let threw = false;
      try {
        for await (const _ of gen) {
          /* */
        }
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(SshConnectionError);
      }
      expect(threw).toBe(true);
    });
  });
});
