import { WebSocketServer, WebSocket } from "ws";
import {
  HeartbeatSchema,
  StatusResponseSchema,
  DeployResponseSchema,
} from "agent-protocol";
import type { LogEntry, NodeAgentClient } from "../../ports/node-agent-client";
import type { ServerStatusReport } from "../../domain/server";
import type { AppSpec } from "../../domain/app-spec";
import type { Repository } from "../../ports/repository";

const REQUEST_TIMEOUT = 15_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class NodeAgentWsServer implements NodeAgentClient {
  readonly port: number;
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>();
  private pending = new Map<string, PendingRequest>();
  private repo: Pick<Repository, "servers">;

  constructor(repo: Pick<Repository, "servers">, port: number = 3001) {
    this.repo = repo;
    this.wss = new WebSocketServer({ port });
    const addr = this.wss.address();
    this.port = addr && typeof addr === "object" ? addr.port : port;
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.wss.on("error", (err) => console.error("node-agent WS error:", err));
    console.log(`node-agent WS server listening on port ${this.port}`);
  }

  private handleConnection(ws: WebSocket): void {
    let serverId: string | null = null;

    ws.on("message", (raw) => {
      const data = typeof raw === "string" ? raw : (raw as Buffer).toString();

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }

      const obj = parsed as Record<string, unknown>;
      const type = typeof obj?.type === "string" ? obj.type : "";

      switch (type) {
        case "heartbeat": {
          const parsed = HeartbeatSchema.safeParse(obj);
          if (parsed.success) {
            serverId = parsed.data.payload.serverId;
          }
          this.handleHeartbeat(ws, obj, serverId);
          break;
        }
        case "status_response":
        case "deploy_response":
        case "heartbeat_ack":
        case "error":
          this.handleResponse(obj);
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      if (serverId) {
        this.connections.delete(serverId);
        this.rejectPendingForServer(serverId);
      }
    });

    ws.on("error", () => {
      if (serverId) {
        this.connections.delete(serverId);
        this.rejectPendingForServer(serverId);
      }
    });
  }

  private async handleHeartbeat(
    ws: WebSocket,
    msg: Record<string, unknown>,
    currentId: string | null,
  ): Promise<void> {
    const parsed = HeartbeatSchema.safeParse(msg);
    if (!parsed.success) {
      // TODO: auth — bare serverId accepted for now
      return;
    }

    const hb = parsed.data.payload;
    const sid = hb.serverId;

    if (!currentId) {
      const existing = this.connections.get(sid);
      if (existing && existing.readyState === WebSocket.OPEN) {
        existing.close();
      }
      this.connections.set(sid, ws);
    }

    ws.send(
      JSON.stringify({
        type: "heartbeat_ack",
        id: `ack-${parsed.data.id}`,
        timestamp: new Date().toISOString(),
        payload: { timestamp: new Date().toISOString() },
      }),
    );
    try {
      const server = await this.repo.servers.getByIdAny(sid);
      if (server) {
        await this.repo.servers.updateHeartbeat(server.orgId, sid);
      }
    } catch (err) {
      console.error(`heartbeat update failed for ${sid}:`, err);
    }
  }

  private handleResponse(msg: Record<string, unknown>): void {
    const id = typeof msg?.id === "string" ? msg.id : "";
    if (!id) return;

    const pend = this.pending.get(id);
    if (pend) {
      clearTimeout(pend.timer);
      this.pending.delete(id);
      pend.resolve(msg);
    }
  }

  private rejectPendingForServer(serverId: string): void {
    for (const [id, pend] of this.pending) {
      pend.reject(new Error(`Server ${serverId} disconnected`));
      clearTimeout(pend.timer);
      this.pending.delete(id);
    }
  }

  private async request<T>(
    serverId: string,
    type: string,
    payload: unknown,
    responseSchema: { safeParse: (data: unknown) => { success: boolean; data?: T } },
  ): Promise<T> {
    const ws = this.connections.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Node agent not connected");
    }

    const id = crypto.randomUUID();
    const msg = { type, id, timestamp: new Date().toISOString(), payload };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${type} request timed out for server ${serverId}`));
      }, REQUEST_TIMEOUT);

      this.pending.set(id, {
        resolve: (v) => {
          const parsed = responseSchema.safeParse(v);
          if (!parsed.success) {
            reject(new Error(`Invalid ${type} response`));
            return;
          }
          resolve(parsed.data as T);
        },
        reject,
        timer,
      } as PendingRequest);

      ws.send(JSON.stringify(msg));
    });
  }

  async getStatus(serverId: string): Promise<ServerStatusReport> {
    const resp = await this.request(
      serverId,
      "get_status",
      {},
      StatusResponseSchema,
    );
    const payload = (resp as Record<string, unknown>).payload as Record<
      string,
      unknown
    >;
    return {
      cpuPercent: payload.cpuPercent as number,
      memoryUsed: payload.memoryUsed as number,
      memoryTotal: payload.memoryTotal as number,
      diskUsed: payload.diskUsed as number,
      diskTotal: payload.diskTotal as number,
      containerCount: (payload.containers as unknown[]).length,
      uptimeSeconds: payload.uptimeSeconds as number,
    };
  }

  async deploy(
    serverId: string,
    deploymentId: string,
    appSpec: AppSpec,
  ): Promise<void> {
    await this.request(serverId, "deploy", { deploymentId, appSpec }, DeployResponseSchema);
  }

  async streamLogs(
    serverId: string,
    _appId: string,
    _lines: number,
  ): Promise<LogEntry[]> {
    const ws = this.connections.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Node agent not connected");
    }
    throw new Error("stream_logs not yet implemented on node agent side");
  }

  async restartApp(_serverId: string, _appId: string): Promise<void> {
    throw new Error("restart not yet implemented in agent protocol");
  }

  async removeApp(
    _serverId: string,
    _appId: string,
    _removeVolumes: boolean,
  ): Promise<void> {
    throw new Error("remove not yet implemented in agent protocol");
  }

  async healthCheck(serverId: string): Promise<boolean> {
    try {
      await this.getStatus(serverId);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.wss.close();
  }
}
