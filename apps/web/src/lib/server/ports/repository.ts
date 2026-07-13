import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";
import type { Server, CreateServerInput } from "../domain/server";
import type { User } from "../domain/user";

export interface Repository {
  createServer(
    input: CreateServerInput & {
      id: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    },
  ): Promise<Server>;
  getServer(id: string): Promise<Server | null>;
  listServers(): Promise<Server[]>;
  updateServerStatus(id: string, status: string): Promise<void>;

  createApp(data: App): Promise<App>;
  getApp(id: string): Promise<App | null>;
  listApps(): Promise<App[]>;
  updateAppStatus(id: string, status: string): Promise<void>;
  deleteApp(id: string): Promise<void>;

  createDeployment(data: Deployment): Promise<Deployment>;
  getDeploymentsForApp(appId: string): Promise<Deployment[]>;
  getLatestDeployment(appId: string): Promise<Deployment | null>;
  updateDeploymentStatus(id: string, status: string): Promise<void>;

  createUser(user: User): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
}
