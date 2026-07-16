import { Client, type ConnectConfig } from "ssh2";
import SFTPClient from "ssh2-sftp-client";
import type {
  NodeCommandClient,
  LogEntry,
  ContainerState,
} from "../../ports/node-command-client";
import type { Server } from "../../domain/server";

const APP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const APPS_BASE_PATH = "/opt/benisploy/apps";

export class SshConnectionError extends Error {
  constructor(
    message: string,
    public readonly serverId: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "SshConnectionError";
  }
}

export class SshCommandError extends Error {
  constructor(
    message: string,
    public readonly serverId: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "SshCommandError";
  }
}

export class SshTimeoutError extends Error {
  constructor(
    message: string,
    public readonly serverId: string,
    public readonly command: string,
  ) {
    super(message);
    this.name = "SshTimeoutError";
  }
}

interface PoolEntry {
  client: Client;
  lastUsed: number;
}

export interface SshNodeCommandClientConfig {
  hostVerifier?: (key: Buffer) => boolean;
  commandTimeoutMs?: number;
  idleTimeoutMs?: number;
  /**
   * The command string passed to SSH exec.
   * In production with a forced-command setup this is passed to the remote
   * side as $SSH_ORIGINAL_COMMAND but ignored by the forced script.
   * For testing without a forced command, set this to the path of the
   * forced-command script to invoke it directly.
   * @default ""
   */
  execCommand?: string;
}

export class SshNodeCommandClient implements NodeCommandClient {
  private pool = new Map<string, PoolEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private resolveServer: (serverId: string) => Promise<Server | null>,
    private config: SshNodeCommandClientConfig = {},
  ) {
    const idleTimeout = config.idleTimeoutMs ?? 120_000;
    this.cleanupTimer = setInterval(
      () => this.cleanupStale(idleTimeout),
      60_000,
    );
    this.cleanupTimer.unref?.();
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    for (const entry of this.pool.values()) {
      entry.client.end();
    }
    this.pool.clear();
  }

  private cleanupStale(idleTimeout: number): void {
    const now = Date.now();
    for (const [id, entry] of this.pool) {
      if (now - entry.lastUsed > idleTimeout) {
        entry.client.end();
        this.pool.delete(id);
      }
    }
  }

  private validateAppId(appId: string): void {
    if (!APP_ID_PATTERN.test(appId)) {
      throw new Error(
        `Invalid app ID: "${appId}". Must match ${String(APP_ID_PATTERN)}`,
      );
    }
  }

  private async getServer(serverId: string): Promise<Server> {
    const server = await this.resolveServer(serverId);
    if (!server) {
      throw new SshConnectionError(`Server ${serverId} not found`, serverId);
    }
    return server;
  }

  private createConnection(server: Server): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      const client = new Client();
      let settled = false;

      client.on("ready", () => {
        if (settled) return;
        settled = true;
        resolve(client);
      });

      client.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(
          new SshConnectionError(
            `Connection failed: ${err.message}`,
            server.id,
            err,
          ),
        );
      });

      client.on("close", () => {
        const entry = this.pool.get(server.id);
        if (entry?.client === client) {
          this.pool.delete(server.id);
        }
      });

      const cfg: ConnectConfig = {
        host: server.address,
        port: server.sshPort ?? 22,
        username: server.sshUser ?? "root",
        privateKey: server.sshPrivateKey,
        readyTimeout: 15_000,
        hostVerifier: this.config.hostVerifier ?? (() => true),
      };

      client.connect(cfg);
    });
  }

  private async withConnection<T>(
    serverId: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const existing = this.pool.get(serverId);
    if (existing) {
      try {
        const result = await fn(existing.client);
        existing.lastUsed = Date.now();
        return result;
      } catch {
        existing.client.end();
        this.pool.delete(serverId);
      }
    }

    const server = await this.getServer(serverId);
    const client = await this.createConnection(server);
    this.pool.set(serverId, { client, lastUsed: Date.now() });

    try {
      return await fn(client);
    } catch (err) {
      this.pool.delete(serverId);
      client.end();
      throw err;
    }
  }

  private execAction(
    client: Client,
    appId: string,
    action: string,
    extra?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = this.config.commandTimeoutMs ?? 60_000;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new SshTimeoutError(
            `"${action} ${appId}" timed out after ${timeout}ms`,
            "",
            action,
          ),
        );
      }, timeout);

      client.exec(this.config.execCommand ?? "", (err, channel) => {
        if (err) {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(
            new SshCommandError(`exec failed: ${err.message}`, "", action, ""),
          );
          return;
        }

        let stdout = "";
        let stderr = "";

        channel.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        channel.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        channel.on("close", (exitCode: number | null) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (exitCode !== null && exitCode !== 0) {
            reject(
              new SshCommandError(
                `Exit code ${exitCode}: ${stderr}`,
                "",
                action,
                stderr,
              ),
            );
          } else {
            resolve({ stdout, stderr });
          }
        });

        channel.stderr.on("error", (chErr: Error) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(
            new SshCommandError(
              `stderr error: ${chErr.message}`,
              "",
              action,
              stderr,
            ),
          );
        });

        channel.on("error", (chErr: Error) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(
            new SshCommandError(
              `Channel error: ${chErr.message}`,
              "",
              action,
              stderr,
            ),
          );
        });

        const payload = extra
          ? `${action} ${appId} ${extra}\n`
          : `${action} ${appId}\n`;
        channel.write(payload);
        channel.end();
      });
    });
  }

  private parseContainerState(stdout: string): ContainerState[] {
    try {
      const rows = JSON.parse(stdout);
      if (!Array.isArray(rows)) return [];
      return rows.map((r: Record<string, unknown>): ContainerState => ({
        id: String(r.ID ?? r.id ?? ""),
        name: String(r.Name ?? r.name ?? ""),
        image: String(r.Image ?? r.image ?? ""),
        project: String(r.Project ?? r.project ?? ""),
        service: String(r.Service ?? r.service ?? ""),
        created: String(r.Created ?? r.created ?? ""),
        state: String(r.State ?? r.state ?? ""),
        status: String(r.Status ?? r.status ?? ""),
        ports: String(r.Ports ?? r.ports ?? ""),
        health: r.Health ? String(r.Health) : undefined,
      }));
    } catch {
      return [];
    }
  }

  private parseLogs(text: string, stream: "stdout" | "stderr"): LogEntry[] {
    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        timestamp: new Date().toISOString(),
        stream,
        message: line,
      }));
  }

  async *deploy(
    serverId: string,
    appId: string,
    composeYaml: string,
  ): AsyncIterable<LogEntry> {
    this.validateAppId(appId);
    const server = await this.getServer(serverId);
    const remoteDir = `${APPS_BASE_PATH}/${appId}`;
    const remotePath = `${remoteDir}/docker-compose.yml`;

    const client = await this.createConnection(server);

    try {
      const sftp = new SFTPClient();
      await sftp.connect({
        host: server.address,
        port: server.sshPort ?? 22,
        username: server.sshUser ?? "root",
        privateKey: server.sshPrivateKey,
        readyTimeout: 15_000,
        hostVerifier: this.config.hostVerifier ?? (() => true),
      } as Record<string, unknown>);
      await (
        sftp.mkdir as unknown as (
          path: string,
          recursive: boolean,
        ) => Promise<string>
      )(remoteDir, true);
      await sftp.put(Buffer.from(composeYaml), remotePath);
      await sftp.end();

      yield {
        timestamp: new Date().toISOString(),
        stream: "stdout",
        message: "Uploaded docker-compose.yml",
      };

      const { stdout, stderr } = await this.execAction(client, appId, "deploy");

      for (const entry of this.parseLogs(stdout, "stdout")) {
        yield entry;
      }
      for (const entry of this.parseLogs(stderr, "stderr")) {
        yield entry;
      }
    } finally {
      client.end();
    }
  }

  async restart(serverId: string, appId: string): Promise<void> {
    this.validateAppId(appId);
    await this.withConnection(serverId, (client) =>
      this.execAction(client, appId, "restart").then(() => {}),
    );
  }

  async stop(serverId: string, appId: string): Promise<void> {
    this.validateAppId(appId);
    await this.withConnection(serverId, (client) =>
      this.execAction(client, appId, "stop").then(() => {}),
    );
  }

  async remove(
    serverId: string,
    appId: string,
    volumes: boolean,
  ): Promise<void> {
    this.validateAppId(appId);
    await this.withConnection(serverId, (client) =>
      this.execAction(
        client,
        appId,
        "delete",
        volumes ? "--volumes" : undefined,
      ).then(() => {}),
    );
  }

  async status(serverId: string, appId: string): Promise<ContainerState[]> {
    this.validateAppId(appId);
    return this.withConnection(serverId, async (client) => {
      const { stdout } = await this.execAction(client, appId, "status");
      return this.parseContainerState(stdout);
    });
  }

  async logs(
    serverId: string,
    appId: string,
    lines: number,
  ): Promise<LogEntry[]> {
    this.validateAppId(appId);
    return this.withConnection(serverId, async (client) => {
      const { stdout, stderr } = await this.execAction(
        client,
        appId,
        "logs",
        String(lines),
      );
      return [
        ...this.parseLogs(stdout, "stdout"),
        ...this.parseLogs(stderr, "stderr"),
      ];
    });
  }

  async isReachable(serverId: string): Promise<boolean> {
    try {
      const server = await this.getServer(serverId);
      const client = await this.createConnection(server);
      client.end();
      return true;
    } catch {
      return false;
    }
  }
}
