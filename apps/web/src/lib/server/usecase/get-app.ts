import type { Repository } from "../ports/repository";
import type { App } from "../domain/app";
import type { Deployment } from "../domain/deployment";

export interface AppWithDeployment {
  app: App;
  currentDeployment: Deployment | null;
}

export function createGetApp(repo: Repository) {
  return async function getApp(
    orgId: string,
    appId: string,
  ): Promise<AppWithDeployment | null> {
    const app = await repo.getApp(orgId, appId);
    if (!app) return null;

    const currentDeployment = await repo.getLatestDeployment(orgId, appId);
    return { app, currentDeployment };
  };
}
