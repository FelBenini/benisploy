import type { Repository } from "../ports/repository";
import type { NodeCommandClient } from "../ports/node-command-client";
import type { App } from "../domain/app";
import type { AppSpec } from "../domain/app-spec";
import type { Deployment } from "../domain/deployment";
import { generateComposeYaml } from "../adapters/compose-gen";

export interface DeployAppV2Output {
  app: App;
  deployment: Deployment;
}

export function createDeployAppV2(
  repo: Repository,
  nodeClient: NodeCommandClient,
) {
  return async function deployAppV2(
    orgId: string,
    appSpec: AppSpec,
    serverId: string,
  ): Promise<DeployAppV2Output> {
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

    const composeYaml = generateComposeYaml(appSpec);

    try {
      for await (const _entry of nodeClient.deploy(
        serverId,
        createdApp.id,
        composeYaml,
      )) {
        // Log entries yielded here; can be stored or forwarded
      }
    } catch (err) {
      await repo.deployments.updateStatus(
        orgId,
        createdDeployment.id,
        "failed",
      );
      await repo.apps.updateStatus(orgId, createdApp.id, "degraded");
      throw err;
    }

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
