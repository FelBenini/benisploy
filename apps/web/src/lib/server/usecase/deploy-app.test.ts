import { describe, it, expect } from "vitest";
import {
  InMemoryRepository,
  FakeNodeAgentClient,
  validAppSpec,
  TEST_ORG_ID,
} from "./test-utils";
import { createDeployApp } from "./deploy-app";

describe("deployApp", () => {
  it("creates an app and deployment with healthy status", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const serverId = "server-1";
    const spec = validAppSpec();

    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    expect(result.app.name).toBe("test-app");
    expect(result.app.serverId).toBe(serverId);
    expect(result.app.status).toBe("healthy");
    expect(result.deployment.status).toBe("healthy");
    expect(result.deployment.version).toBe(1);
  });

  it("calls the node agent to deploy", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const serverId = "server-2";
    const spec = validAppSpec({ name: "nginx-app" });
    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    expect(nodeAgent.deployed).toHaveLength(1);
    expect(nodeAgent.deployed[0].serverId).toBe(serverId);
    expect(nodeAgent.deployed[0].deploymentId).toBe(result.deployment.id);
    expect(nodeAgent.deployed[0].appSpec.name).toBe("nginx-app");
  });

  it("persists app and deployment in the repository", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

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

  it("transitions deployment through expected states", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const result = await deployApp(TEST_ORG_ID, validAppSpec(), "server-4");

    expect(result.deployment.status).toBe("healthy");

    const initialDeployments = await repo.deployments.listForApp(
      TEST_ORG_ID,
      result.app.id,
    );
    const dep = initialDeployments[0];

    expect(dep.id).toBe(result.deployment.id);
    expect(dep.status).toBe("healthy");
  });
});
