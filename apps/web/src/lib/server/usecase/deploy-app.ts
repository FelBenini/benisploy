import type { Repository } from "../ports/repository";
import type { NodeAgentClient } from "../ports/node-agent-client";
import type { App } from "../domain/app";
import type { AppSpec } from "../domain/app-spec";
import type { Deployment } from "../domain/deployment";

export interface DeployAppOutput {
  app: App;
  deployment: Deployment;
}

export function createDeployApp(repo: Repository, nodeAgent: NodeAgentClient) {
  return async function deployApp(
    orgId: string,
    appSpec: AppSpec,
    serverId: string,
  ): Promise<DeployAppOutput> {
    const now = new Date().toISOString();

    const app: App = {
      id: crypto.randomUUID(),
      name: appSpec.name,
      serverId,
      status: "deploying",
      createdAt: now,
      updatedAt: now,
    };

    const createdApp = await repo.apps.create(orgId, app);

    const version = 1;
    const deployment: Deployment = {
      id: crypto.randomUUID(),
      appId: createdApp.id,
      serverId,
      status: "pending",
      appSpec,
      version,
      createdAt: now,
      updatedAt: now,
    };

    const createdDeployment = await repo.deployments.create(orgId, deployment);

    await repo.deployments.updateStatus(
      orgId,
      createdDeployment.id,
      "executing",
    );
    await nodeAgent.deploy(serverId, createdDeployment.id, appSpec);

    await repo.deployments.updateStatus(orgId, createdDeployment.id, "healthy");
    await repo.apps.updateStatus(orgId, createdApp.id, "healthy");

    const finalApp = (await repo.apps.get(orgId, createdApp.id))!;
    const finalDeployment = (await repo.deployments.getLatest(
      orgId,
      createdApp.id,
    ))!;

    return { app: finalApp, deployment: finalDeployment };
  };
}
