import type { Repository } from "../ports/repository";
import type { NodeAgentClient, LogEntry } from "../ports/node-agent-client";
import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type {
  Server,
  CreateServerInput,
  ServerStatusReport,
} from "../domain/server";
import type { User } from "../domain/user";
import type { AppSpec } from "../domain/app-spec";

export class InMemoryRepository implements Repository {
  servers = new Map<string, Server>();
  apps = new Map<string, App>();
  deployments = new Map<string, Deployment>();
  users = new Map<string, User>();

  async createServer(data: Server): Promise<Server> {
    this.servers.set(data.id, data);
    return data;
  }

  async getServer(id: string): Promise<Server | null> {
    return this.servers.get(id) ?? null;
  }

  async listServers(): Promise<Server[]> {
    return Array.from(this.servers.values());
  }

  async updateServerStatus(id: string, status: string): Promise<void> {
    const server = this.servers.get(id);
    if (server) {
      this.servers.set(id, {
        ...server,
        status: status as Server["status"],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async createApp(data: App): Promise<App> {
    this.apps.set(data.id, data);
    return data;
  }

  async getApp(id: string): Promise<App | null> {
    return this.apps.get(id) ?? null;
  }

  async listApps(): Promise<App[]> {
    return Array.from(this.apps.values());
  }

  async updateAppStatus(id: string, status: string): Promise<void> {
    const app = this.apps.get(id);
    if (app) {
      this.apps.set(id, {
        ...app,
        status: status as App["status"],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async deleteApp(id: string): Promise<void> {
    this.apps.delete(id);
  }

  async createDeployment(data: Deployment): Promise<Deployment> {
    this.deployments.set(data.id, data);
    return data;
  }

  async getDeploymentsForApp(appId: string): Promise<Deployment[]> {
    return Array.from(this.deployments.values()).filter(
      (d) => d.appId === appId,
    );
  }

  async getLatestDeployment(appId: string): Promise<Deployment | null> {
    const appDeployments = Array.from(this.deployments.values())
      .filter((d) => d.appId === appId)
      .sort((a, b) => b.version - a.version);
    return appDeployments[0] ?? null;
  }

  async updateDeploymentStatus(id: string, status: string): Promise<void> {
    const dep = this.deployments.get(id);
    if (dep) {
      this.deployments.set(id, {
        ...dep,
        status: status as Deployment["status"],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return (
      Array.from(this.users.values()).find((u) => u.email === email) ?? null
    );
  }
}

export class FakeNodeAgentClient implements NodeAgentClient {
  deployed: Array<{
    serverId: string;
    deploymentId: string;
    appSpec: AppSpec;
  }> = [];
  statusReport: ServerStatusReport = {
    cpuPercent: 25,
    memoryUsed: 4_000_000_000,
    memoryTotal: 8_000_000_000,
    diskUsed: 50_000_000_000,
    diskTotal: 100_000_000_000,
    containerCount: 3,
    uptimeSeconds: 3600,
  };
  logs: LogEntry[] = [];

  async deploy(
    serverId: string,
    deploymentId: string,
    appSpec: AppSpec,
  ): Promise<void> {
    this.deployed.push({ serverId, deploymentId, appSpec });
  }

  async getStatus(_serverId: string): Promise<ServerStatusReport> {
    return this.statusReport;
  }

  async streamLogs(
    _serverId: string,
    _appId: string,
    _lines: number,
  ): Promise<LogEntry[]> {
    return this.logs;
  }

  async restartApp(_serverId: string, _appId: string): Promise<void> {}

  async removeApp(
    _serverId: string,
    _appId: string,
    _removeVolumes: boolean,
  ): Promise<void> {}

  async healthCheck(_serverId: string): Promise<boolean> {
    return true;
  }
}

export function validAppSpec(overrides?: Partial<AppSpec>): AppSpec {
  return {
    name: "test-app",
    image: "nginx:alpine",
    envVars: {},
    ports: [],
    volumeMounts: [],
    ...overrides,
  };
}
