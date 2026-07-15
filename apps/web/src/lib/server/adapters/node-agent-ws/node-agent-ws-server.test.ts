import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import type { Repository, ServerWithOrg } from "$lib/server/ports/repository";
import { NodeAgentWsServer } from "./node-agent-ws-server";

const serverStore = new Map<
  string,
  { orgId: string; server: Record<string, unknown> }
>();

const inMemRepo: Repository = {
  servers: {
    async getByIdAny(id: string): Promise<ServerWithOrg | null> {
      const entry = serverStore.get(id);
      if (!entry) return null;
      return { ...entry.server, orgId: entry.orgId } as ServerWithOrg;
    },
    async updateHeartbeat(_orgId: string, id: string) {
      const entry = serverStore.get(id);
      if (entry) {
        entry.server.lastHeartbeatAt = new Date().toISOString();
        entry.server.status = "online";
      }
    },
    async create() {
      throw new Error("not implemented");
    },
    async get() {
      throw new Error("not implemented");
    },
    async list() {
      throw new Error("not implemented");
    },
    async updateStatus() {
      throw new Error("not implemented");
    },
  },
  apps: {
    async create() {
      throw new Error("not implemented");
    },
    async get() {
      throw new Error("not implemented");
    },
    async list() {
      throw new Error("not implemented");
    },
    async updateStatus() {
      throw new Error("not implemented");
    },
    async delete() {
      throw new Error("not implemented");
    },
  },
  deployments: {
    async create() {
      throw new Error("not implemented");
    },
    async listForApp() {
      throw new Error("not implemented");
    },
    async getLatest() {
      throw new Error("not implemented");
    },
    async updateStatus() {
      throw new Error("not implemented");
    },
  },
  users: {
    async create() {
      throw new Error("not implemented");
    },
    async get() {
      throw new Error("not implemented");
    },
    async getByEmail() {
      throw new Error("not implemented");
    },
    async getPasswordHashByEmail() {
      throw new Error("not implemented");
    },
  },
  sessions: {
    async create() {
      throw new Error("not implemented");
    },
    async get() {
      throw new Error("not implemented");
    },
    async delete() {
      throw new Error("not implemented");
    },
    async deleteAllForUser() {
      throw new Error("not implemented");
    },
  },
  systemSetup: {
    async isConfigured() {
      throw new Error("not implemented");
    },
    async tryAcquire() {
      throw new Error("not implemented");
    },
  },
  orgs: {
    async create() {
      throw new Error("not implemented");
    },
  },
  memberships: {
    async create() {
      throw new Error("not implemented");
    },
    async findByUserId() {
      throw new Error("not implemented");
    },
  },
};

function waitForMessage(
  ws: WebSocket,
  timeout = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe("NodeAgentWsServer", () => {
  let server: NodeAgentWsServer;
  let port: number;

  beforeEach(() => {
    serverStore.clear();
    serverStore.set("srv-1", {
      orgId: "org-1",
      server: {
        id: "srv-1",
        name: "test",
        status: "offline",
        memoryBytes: 8_000_000_000,
        diskBytes: 100_000_000_000,
      },
    });

    server = new NodeAgentWsServer(inMemRepo, 0);
    port = server.port;
  });

  afterEach(() => {
    server.close();
  });

  it("accepts a connection and registers on heartbeat", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.once("open", resolve));

    ws.send(
      JSON.stringify({
        type: "heartbeat",
        id: "hb-1",
        timestamp: new Date().toISOString(),
        payload: {
          serverId: "srv-1",
          hostname: "box1",
          cpuPercent: 23.5,
          memoryUsed: 2_000_000_000,
          memoryTotal: 8_000_000_000,
          diskUsed: 40_000_000_000,
          diskTotal: 100_000_000_000,
          uptimeSeconds: 3600,
        },
      }),
    );

    const ack = await waitForMessage(ws);
    expect(ack.type).toBe("heartbeat_ack");
    expect((ack.payload as Record<string, unknown>).timestamp).toBeDefined();

    const entry = serverStore.get("srv-1")!;
    expect(entry.server.status).toBe("online");
    expect(entry.server.lastHeartbeatAt).toBeDefined();

    ws.close();
  });

  it("getStatus returns live data from agent", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.once("open", resolve));

    // Register via heartbeat first
    ws.send(
      JSON.stringify({
        type: "heartbeat",
        id: "hb-1",
        timestamp: new Date().toISOString(),
        payload: {
          serverId: "srv-1",
          hostname: "box1",
          cpuPercent: 10,
          memoryUsed: 1_000_000_000,
          memoryTotal: 8_000_000_000,
          diskUsed: 20_000_000_000,
          diskTotal: 100_000_000_000,
          uptimeSeconds: 100,
        },
      }),
    );
    await waitForMessage(ws); // consume ack

    // Send getStatus to the server (simulate agent responding)
    const statusPromise = server.getStatus("srv-1");

    // Agent receives get_status, must respond with status_response
    const req = await waitForMessage(ws);
    expect(req.type).toBe("get_status");

    // Agent responds
    ws.send(
      JSON.stringify({
        type: "status_response",
        id: req.id,
        timestamp: new Date().toISOString(),
        payload: {
          cpuPercent: 45.2,
          memoryUsed: 4_000_000_000,
          memoryTotal: 8_000_000_000,
          diskUsed: 50_000_000_000,
          diskTotal: 100_000_000_000,
          containers: [
            {
              id: "c1",
              name: "web",
              image: "nginx",
              state: "running",
              portMappings: [],
            },
          ],
          uptimeSeconds: 3600,
        },
      }),
    );

    const status = await statusPromise;
    expect(status.cpuPercent).toBe(45.2);
    expect(status.memoryUsed).toBe(4_000_000_000);
    expect(status.memoryTotal).toBe(8_000_000_000);
    expect(status.containerCount).toBe(1);

    ws.close();
  });
});
