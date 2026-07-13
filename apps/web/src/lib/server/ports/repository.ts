import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Server, CreateServerInput } from "../domain/server";
import type { User } from "../domain/user";

export interface Repository {
  createServer(
    orgId: string,
    input: CreateServerInput & {
      id: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    },
  ): Promise<Server>;
  getServer(orgId: string, id: string): Promise<Server | null>;
  listServers(orgId: string): Promise<Server[]>;
  updateServerStatus(orgId: string, id: string, status: string): Promise<void>;

  createApp(orgId: string, data: App): Promise<App>;
  getApp(orgId: string, id: string): Promise<App | null>;
  listApps(orgId: string): Promise<App[]>;
  updateAppStatus(orgId: string, id: string, status: string): Promise<void>;
  deleteApp(orgId: string, id: string): Promise<void>;

  createDeployment(orgId: string, data: Deployment): Promise<Deployment>;
  getDeploymentsForApp(orgId: string, appId: string): Promise<Deployment[]>;
  getLatestDeployment(orgId: string, appId: string): Promise<Deployment | null>;
  updateDeploymentStatus(
    orgId: string,
    id: string,
    status: string,
  ): Promise<void>;

  createUser(orgId: string, user: User): Promise<User>;
  getUser(orgId: string, id: string): Promise<User | null>;
  getUserByEmail(orgId: string, email: string): Promise<User | null>;
}
