import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Org } from "../domain/org";
import type { OrgMembership } from "../domain/org-membership";
import type { Session } from "../domain/session";
import type { Server, CreateServerInput } from "../domain/server";
import type { User } from "../domain/user";

export interface DbExecutor {
  insert(table: unknown): {
    values(data: unknown): {
      onConflictDoNothing(): {
        returning(fields?: unknown): Promise<unknown[]>;
      };
      returning(fields?: unknown): Promise<unknown[]>;
    };
  };
  update(table: unknown): {
    set(data: unknown): {
      where(condition: unknown): {
        returning(fields?: unknown): Promise<unknown[]>;
      };
    };
  };
}

export interface ServerWithOrg extends Server {
  orgId: string;
}

export interface ServerRepository {
  create(
    orgId: string,
    input: CreateServerInput & {
      id: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    },
  ): Promise<Server>;
  get(orgId: string, id: string): Promise<Server | null>;
  getByIdAny(id: string): Promise<ServerWithOrg | null>;
  list(orgId: string): Promise<Server[]>;
  updateStatus(orgId: string, id: string, status: string): Promise<void>;
  updateHeartbeat(orgId: string, id: string): Promise<void>;
}

export interface AppRepository {
  create(orgId: string, data: App): Promise<App>;
  get(orgId: string, id: string): Promise<App | null>;
  list(orgId: string): Promise<App[]>;
  updateStatus(orgId: string, id: string, status: string): Promise<void>;
  delete(orgId: string, id: string): Promise<void>;
}

export interface DeploymentRepository {
  create(orgId: string, data: Deployment): Promise<Deployment>;
  listForApp(orgId: string, appId: string): Promise<Deployment[]>;
  getLatest(orgId: string, appId: string): Promise<Deployment | null>;
  updateStatus(orgId: string, id: string, status: string): Promise<void>;
}

export interface UserRepository {
  create(
    db: DbExecutor,
    orgId: string,
    user: User,
    passwordHash?: string,
  ): Promise<User>;
  get(orgId: string, id: string): Promise<User | null>;
  getByEmail(orgId: string, email: string): Promise<User | null>;
  getPasswordHashByEmail(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null>;
}

export interface OrgRepository {
  create(db: DbExecutor, org: Org): Promise<Org>;
}

export interface OrgMembershipRepository {
  create(db: DbExecutor, membership: OrgMembership): Promise<OrgMembership>;
  findByUserId(userId: string): Promise<OrgMembership | null>;
}

export interface SessionRepository {
  create(db: DbExecutor, session: Session): Promise<Session>;
  get(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export interface SystemSetupRepository {
  isConfigured(): Promise<boolean>;
  tryAcquire(db: DbExecutor): Promise<boolean>;
}

export interface Repository {
  servers: ServerRepository;
  apps: AppRepository;
  deployments: DeploymentRepository;
  users: UserRepository;
  sessions: SessionRepository;
  systemSetup: SystemSetupRepository;
  orgs: OrgRepository;
  memberships: OrgMembershipRepository;
}
