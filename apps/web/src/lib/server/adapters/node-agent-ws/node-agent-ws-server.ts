import { WebSocketServer, WebSocket } from "ws";
import {
  HeartbeatSchema,
  StatusResponseSchema,
  DeployResponseSchema,
  LogEntrySchema,
  ErrorSchema,
} from "agent-protocol";
import type {
  LogEntry,
  DeploymentResult,
  DeploymentMeta,
  NodeAgentClient,
} from "../../ports/node-agent-client";
import type { ServerStatusReport } from "../../domain/server";
import type { AppSpec } from "../../domain/app-spec";
import type { Repository } from "../../ports/repository";

const REQUEST_TIMEOUT = 15_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type LogCallback = (entry: LogEntry) => void;
type CompleteCallback = (result: DeploymentResult) => void;

export class NodeAgentWsServer implements NodeAgentClient {
  readonly port: number;
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>();
  private pending = new Map<string, PendingRequest>();
  private repo: Repository;

  private logBuffers = new Map<string, LogEntry[]>();
  private logSubscribers = new Map<string, Set<LogCallback>>();
  private completeSubscribers = new Map<string, Set<CompleteCallback>>();
  private deployMetaMap = new Map<string, DeploymentMeta>();
  private deployMsgIds = new Map<string, string>();

  constructor(repo: Repository, port: number = 3001) {
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
          const _prevServerId = serverId;
          const parsed = HeartbeatSchema.safeParse(obj);
          if (parsed.success) {
            serverId = parsed.data.payload.serverId;
          }
          this.handleHeartbeat(ws, obj, _prevServerId);
          break;
        }
        case "log_entry":
          this.handleLogEntry(obj);
          break;
        case "deploy_response":
          this.handleDeployResponse(obj);
          break;
        case "error":
          this.handleAgentError(obj);
          break;
        case "status_response":
        case "heartbeat_ack":
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

  private async handleLogEntry(msg: Record<string, unknown>): Promise<void> {
    const parsed = LogEntrySchema.safeParse(msg);
    if (!parsed.success) return;

    const entry: LogEntry = {
      timestamp: parsed.data.payload.timestamp,
      stream: parsed.data.payload.stream,
      message: parsed.data.payload.message,
    };

    const deploymentId = parsed.data.payload.deploymentId;
    if (!deploymentId) return;

    let buf = this.logBuffers.get(deploymentId);
    if (!buf) {
      buf = [];
      this.logBuffers.set(deploymentId, buf);
    }
    buf.push(entry);

    const subs = this.logSubscribers.get(deploymentId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(entry);
        } catch {
          // subscriber error, skip
        }
      }
    }
  }

  private async handleDeployResponse(
    msg: Record<string, unknown>,
  ): Promise<void> {
    const parsed = DeployResponseSchema.safeParse(msg);
    if (!parsed.success) return;

    const deploymentId = parsed.data.payload.deploymentId;
    const accepted = parsed.data.payload.accepted;

    const envId = typeof msg.id === "string" ? msg.id : "";
    this.deployMsgIds.delete(envId);

    const result: DeploymentResult = {
      success: accepted,
      error: accepted ? undefined : "Agent rejected deployment",
    };

    await this.finalizeDeployment(deploymentId, result);
  }

  private async handleAgentError(msg: Record<string, unknown>): Promise<void> {
    const parsed = ErrorSchema.safeParse(msg);
    if (!parsed.success) return;

    const envId = typeof msg.id === "string" ? msg.id : "";
    const deploymentId =
      this.deployMsgIds.get(envId) ??
      this.deployMsgIds.get(parsed.data.payload.originalMessageId);

    if (deploymentId) {
      const result: DeploymentResult = {
        success: false,
        error: parsed.data.payload.message,
      };
      await this.finalizeDeployment(deploymentId, result);
    }

    this.handleResponse(msg);
  }

  private async finalizeDeployment(
    deploymentId: string,
    result: DeploymentResult,
  ): Promise<void> {
    const subs = this.completeSubscribers.get(deploymentId);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(result);
        } catch {
          // subscriber error, skip
        }
      }
    }

    this.cleanupDeployment(deploymentId);

    const meta = this.deployMetaMap.get(deploymentId);
    if (!meta) {
      console.error(
        `no deploy meta for ${deploymentId}, cannot update status`,
      );
      return;
    }
    this.deployMetaMap.delete(deploymentId);

    try {
      if (result.success) {
        await this.repo.deployments.updateStatus(
          meta.orgId,
          deploymentId,
          "healthy",
        );
        await this.repo.apps.updateStatus(meta.orgId, meta.appId, "healthy");
      } else {
        await this.repo.deployments.updateStatus(
          meta.orgId,
          deploymentId,
          "failed",
        );
        await this.repo.apps.updateStatus(meta.orgId, meta.appId, "degraded");
      }
    } catch (err) {
      console.error(
        `failed to update deployment ${deploymentId} status:`,
        err,
      );
    }
  }

  private cleanupDeployment(deploymentId: string): void {
    this.logSubscribers.delete(deploymentId);
    this.completeSubscribers.delete(deploymentId);
    this.deployMetaMap.delete(deploymentId);

    for (const [msgId, depId] of this.deployMsgIds) {
      if (depId === deploymentId) {
        this.deployMsgIds.delete(msgId);
      }
    }

    setTimeout(() => {
      this.logBuffers.delete(deploymentId);
    }, 60_000);
  }

  getBufferedLogs(deploymentId: string): LogEntry[] {
    return this.logBuffers.get(deploymentId) ?? [];
  }

  private async handleHeartbeat(
    ws: WebSocket,
    msg: Record<string, unknown>,
    currentId: string | null,
  ): Promise<void> {
    const parsed = HeartbeatSchema.safeParse(msg);
    if (!parsed.success) {
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
    responseSchema: {
      safeParse: (data: unknown) => { success: boolean; data?: T };
    },
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

  async sendDeploy(
    serverId: string,
    deploymentId: string,
    appSpec: AppSpec,
    meta?: DeploymentMeta,
  ): Promise<void> {
    const ws = this.connections.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Node agent not connected");
    }

    const msgId = crypto.randomUUID();

    if (meta) {
      this.deployMetaMap.set(deploymentId, meta);
    }
    this.deployMsgIds.set(msgId, deploymentId);

    const msg = {
      type: "deploy",
      id: msgId,
      timestamp: new Date().toISOString(),
      payload: { deploymentId, appSpec },
    };

    ws.send(JSON.stringify(msg));
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
    meta?: DeploymentMeta,
  ): Promise<void> {
    return this.sendDeploy(serverId, deploymentId, appSpec, meta);
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

  onDeploymentLog(
    deploymentId: string,
    callback: LogCallback,
  ): () => void {
    if (!this.logSubscribers.has(deploymentId)) {
      this.logSubscribers.set(deploymentId, new Set());
    }
    this.logSubscribers.get(deploymentId)!.add(callback);
    return () => {
      this.logSubscribers.get(deploymentId)?.delete(callback);
    };
  }

  onDeploymentComplete(
    deploymentId: string,
    callback: CompleteCallback,
  ): () => void {
    if (!this.completeSubscribers.has(deploymentId)) {
      this.completeSubscribers.set(deploymentId, new Set());
    }
    this.completeSubscribers.get(deploymentId)!.add(callback);
    return () => {
      this.completeSubscribers.get(deploymentId)?.delete(callback);
    };
  }

  close(): void {
    this.wss.close();
  }
}
