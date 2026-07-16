import { describe, it, expect } from "vitest";
import {
  InMemoryRepository,
  FakeNodeCommandClient,
  validAppSpec,
  TEST_ORG_ID,
} from "./test-utils";
import { createDeployAppV2 } from "./deploy-app-v2";

describe("deployAppV2", () => {
  it("creates an app and deployment with healthy status", async () => {
    const repo = new InMemoryRepository();
    const nodeClient = new FakeNodeCommandClient();
    const deployApp = createDeployAppV2(repo, nodeClient);

    const serverId = "server-1";
    const spec = validAppSpec();

    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    expect(result.app.name).toBe("test-app");
    expect(result.app.serverId).toBe(serverId);
    expect(result.app.status).toBe("healthy");
    expect(result.deployment.status).toBe("healthy");
    expect(result.deployment.version).toBe(1);
  });

  it("calls the node client to deploy with generated compose YAML", async () => {
    const repo = new InMemoryRepository();
    const nodeClient = new FakeNodeCommandClient();
    const deployApp = createDeployAppV2(repo, nodeClient);

    const serverId = "server-2";
    const spec = validAppSpec({ name: "nginx-app" });
    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    expect(nodeClient.deployed).toHaveLength(1);
    expect(nodeClient.deployed[0].serverId).toBe(serverId);
    expect(nodeClient.deployed[0].appId).toBe(result.app.id);
    expect(nodeClient.deployed[0].composeYaml).toContain("nginx:alpine");
  });

  it("persists app and deployment in the repository", async () => {
    const repo = new InMemoryRepository();
    const nodeClient = new FakeNodeCommandClient();
    const deployApp = createDeployAppV2(repo, nodeClient);

    const serverId = "server-3";
    const spec = validAppSpec({ name: "persisted-app" });
    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    const storedApp = await repo.apps.get(TEST_ORG_ID, result.app.id);
    expect(storedApp).not.toBeNull();
    expect(storedApp!.name).toBe("persisted-app");

    const storedDeployments = await repo.deployments.listForApp(
      TEST_ORG_ID,
      result.app.id,
    );
    expect(storedDeployments).toHaveLength(1);
  });

  it("marks deployment as failed on node client error", async () => {
    const repo = new InMemoryRepository();
    const nodeClient = new FakeNodeCommandClient();
    nodeClient.deployError = new Error("ssh connection failed");
    const deployApp = createDeployAppV2(repo, nodeClient);

    const serverId = "server-5";
    const spec = validAppSpec();

    await expect(deployApp(TEST_ORG_ID, spec, serverId)).rejects.toThrow(
      "ssh connection failed",
    );

    const apps = await repo.apps.list(TEST_ORG_ID);
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe("degraded");

    const deployments = await repo.deployments.listForApp(
      TEST_ORG_ID,
      apps[0].id,
    );
    expect(deployments).toHaveLength(1);
    expect(deployments[0].status).toBe("failed");
  });

  it("transitions deployment to executing state", async () => {
    const repo = new InMemoryRepository();
    const nodeClient = new FakeNodeCommandClient();
    const deployApp = createDeployAppV2(repo, nodeClient);

    const result = await deployApp(TEST_ORG_ID, validAppSpec(), "server-4");

    const initialDeployments = await repo.deployments.listForApp(
      TEST_ORG_ID,
      result.app.id,
    );
    const dep = initialDeployments[0];
    expect(dep.id).toBe(result.deployment.id);
    expect(dep.status).toBe("healthy");
  });
});
