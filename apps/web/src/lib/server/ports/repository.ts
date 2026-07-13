import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Server, CreateServerInput } from "../domain/server";
import type { User } from "../domain/user";

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
  list(orgId: string): Promise<Server[]>;
  updateStatus(orgId: string, id: string, status: string): Promise<void>;
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
  create(orgId: string, user: User): Promise<User>;
  get(orgId: string, id: string): Promise<User | null>;
  getByEmail(orgId: string, email: string): Promise<User | null>;
}

export interface Repository {
  servers: ServerRepository;
  apps: AppRepository;
  deployments: DeploymentRepository;
  users: UserRepository;
}
