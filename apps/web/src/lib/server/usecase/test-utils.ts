import type {
  Repository,
  ServerRepository,
  AppRepository,
  DeploymentRepository,
  UserRepository,
} from "../ports/repository";
import type { NodeAgentClient, LogEntry } from "../ports/node-agent-client";
import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Server, ServerStatusReport } from "../domain/server";
import type { User } from "../domain/user";
import type { AppSpec } from "../domain/app-spec";

class InMemoryServerRepo implements ServerRepository {
  items = new Map<string, { data: Server; orgId: string }>();

  async create(orgId: string, data: Server): Promise<Server> {
    this.items.set(data.id, { data, orgId });
    return data;
  }

  async get(orgId: string, id: string): Promise<Server | null> {
    const entry = this.items.get(id);
    return entry && entry.orgId === orgId ? entry.data : null;
  }

  async list(orgId: string): Promise<Server[]> {
    return Array.from(this.items.values())
      .filter((e) => e.orgId === orgId)
      .map((e) => e.data);
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    const entry = this.items.get(id);
    if (entry && entry.orgId === orgId) {
      this.items.set(id, {
        data: {
          ...entry.data,
          status: status as Server["status"],
          updatedAt: new Date().toISOString(),
        },
        orgId,
      });
    }
  }
}

class InMemoryAppRepo implements AppRepository {
  items = new Map<string, { data: App; orgId: string }>();

  async create(orgId: string, data: App): Promise<App> {
    this.items.set(data.id, { data, orgId });
    return data;
  }

  async get(orgId: string, id: string): Promise<App | null> {
    const entry = this.items.get(id);
    return entry && entry.orgId === orgId ? entry.data : null;
  }

  async list(orgId: string): Promise<App[]> {
    return Array.from(this.items.values())
      .filter((e) => e.orgId === orgId)
      .map((e) => e.data);
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    const entry = this.items.get(id);
    if (entry && entry.orgId === orgId) {
      this.items.set(id, {
        data: {
          ...entry.data,
          status: status as App["status"],
          updatedAt: new Date().toISOString(),
        },
        orgId,
      });
    }
  }

  async delete(orgId: string, id: string): Promise<void> {
    const entry = this.items.get(id);
    if (entry && entry.orgId === orgId) {
      this.items.delete(id);
    }
  }
}

class InMemoryDeploymentRepo implements DeploymentRepository {
  items = new Map<string, { data: Deployment; orgId: string }>();
  apps: InMemoryAppRepo;

  constructor(apps: InMemoryAppRepo) {
    this.apps = apps;
  }

  async create(orgId: string, data: Deployment): Promise<Deployment> {
    this.items.set(data.id, { data, orgId });
    return data;
  }

  async listForApp(orgId: string, appId: string): Promise<Deployment[]> {
    const appEntry = this.apps.items.get(appId);
    if (!appEntry || appEntry.orgId !== orgId) return [];

    return Array.from(this.items.values())
      .filter((e) => e.data.appId === appId)
      .map((e) => e.data);
  }

  async getLatest(orgId: string, appId: string): Promise<Deployment | null> {
    const appEntry = this.apps.items.get(appId);
    if (!appEntry || appEntry.orgId !== orgId) return null;

    const appDeployments = Array.from(this.items.values())
      .filter((e) => e.data.appId === appId)
      .map((e) => e.data)
      .sort((a, b) => b.version - a.version);
    return appDeployments[0] ?? null;
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    const dep = this.items.get(id);
    if (dep) {
      this.items.set(id, {
        data: {
          ...dep.data,
          status: status as Deployment["status"],
          updatedAt: new Date().toISOString(),
        },
        orgId,
      });
    }
  }
}

class InMemoryUserRepo implements UserRepository {
  items = new Map<string, { data: User; orgId: string }>();

  async create(orgId: string, user: User): Promise<User> {
    this.items.set(user.id, { data: user, orgId });
    return user;
  }

  async get(orgId: string, id: string): Promise<User | null> {
    const entry = this.items.get(id);
    return entry && entry.orgId === orgId ? entry.data : null;
  }

  async getByEmail(orgId: string, email: string): Promise<User | null> {
    const entry = Array.from(this.items.values()).find(
      (e) => e.data.email === email,
    );
    return entry && entry.orgId === orgId ? entry.data : null;
  }
}

export class InMemoryRepository implements Repository {
  servers: InMemoryServerRepo;
  apps: InMemoryAppRepo;
  deployments: InMemoryDeploymentRepo;
  users: InMemoryUserRepo;

  constructor() {
    this.apps = new InMemoryAppRepo();
    this.servers = new InMemoryServerRepo();
    this.deployments = new InMemoryDeploymentRepo(this.apps);
    this.users = new InMemoryUserRepo();
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

export const TEST_ORG_ID = "org-test-1";
