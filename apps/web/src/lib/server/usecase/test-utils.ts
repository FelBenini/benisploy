import type {
  Repository,
  ServerRepository,
  AppRepository,
  DeploymentRepository,
  UserRepository,
  SessionRepository,
  SystemSetupRepository,
  OrgRepository,
  OrgMembershipRepository,
} from "../ports/repository";
import type { NodeAgentClient, LogEntry } from "../ports/node-agent-client";
import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Session } from "../domain/session";
import type { Org } from "../domain/org";
import type { OrgMembership } from "../domain/org-membership";
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
  passwordHashes = new Map<string, string>();

  async create(orgId: string, user: User, passwordHash?: string): Promise<User> {
    this.items.set(user.id, { data: user, orgId });
    if (passwordHash) {
      this.passwordHashes.set(user.id, passwordHash);
    }
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

  async getPasswordHashByEmail(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null> {
    const entry = Array.from(this.items.values()).find(
      (e) => e.data.email === email,
    );
    if (!entry) return null;
    const hash = this.passwordHashes.get(entry.data.id) ?? "";
    return { user: entry.data, passwordHash: hash };
  }
}

class InMemorySessionRepo implements SessionRepository {
  items = new Map<string, Session>();

  async create(session: Session): Promise<Session> {
    this.items.set(session.id, { ...session });
    return session;
  }

  async get(id: string): Promise<Session | null> {
    const entry = this.items.get(id);
    return entry ? { ...entry } : null;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [id, session] of this.items) {
      if (session.userId === userId) {
        this.items.delete(id);
      }
    }
  }
}

class InMemorySystemSetupRepo implements SystemSetupRepository {
  configured = false;

  async isConfigured(): Promise<boolean> {
    return this.configured;
  }

  async markAsConfigured(): Promise<void> {
    this.configured = true;
  }
}

class InMemoryOrgRepo implements OrgRepository {
  items = new Map<string, Org>();

  async create(org: Org): Promise<Org> {
    this.items.set(org.id, { ...org });
    return org;
  }
}

class InMemoryMembershipRepo implements OrgMembershipRepository {
  items: OrgMembership[] = [];

  async create(membership: OrgMembership): Promise<OrgMembership> {
    this.items.push({ ...membership });
    return membership;
  }
}

export class InMemoryRepository implements Repository {
  servers: InMemoryServerRepo;
  apps: InMemoryAppRepo;
  deployments: InMemoryDeploymentRepo;
  users: InMemoryUserRepo;
  sessions: InMemorySessionRepo;
  systemSetup: InMemorySystemSetupRepo;
  orgs: InMemoryOrgRepo;
  memberships: InMemoryMembershipRepo;

  constructor() {
    this.apps = new InMemoryAppRepo();
    this.servers = new InMemoryServerRepo();
    this.deployments = new InMemoryDeploymentRepo(this.apps);
    this.users = new InMemoryUserRepo();
    this.sessions = new InMemorySessionRepo();
    this.systemSetup = new InMemorySystemSetupRepo();
    this.orgs = new InMemoryOrgRepo();
    this.memberships = new InMemoryMembershipRepo();
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
