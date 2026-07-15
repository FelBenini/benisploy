import { describe, it, expect } from "vitest";
import {
  InMemoryRepository,
  FakeNodeAgentClient,
  validAppSpec,
  TEST_ORG_ID,
} from "./test-utils";
import { createDeployApp } from "./deploy-app";
import type { AppSpec } from "../domain/app-spec";

describe("deployApp", () => {
  it("creates an app and deployment with executing status", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const serverId = "server-1";
    const spec = validAppSpec();

    const result = await deployApp(TEST_ORG_ID, spec, serverId);

    expect(result.app.name).toBe("test-app");
    expect(result.app.serverId).toBe(serverId);
    expect(result.app.status).toBe("deploying");
    expect(result.deployment.status).toBe("executing");
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

  it("marks deployment as failed on node agent error", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    nodeAgent.sendDeployImpl = async () => {
      throw new Error("agent disconnected");
    };
    const deployApp = createDeployApp(repo, nodeAgent);

    const serverId = "server-5";
    const spec = validAppSpec();

    await expect(deployApp(TEST_ORG_ID, spec, serverId)).rejects.toThrow(
      "agent disconnected",
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
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const result = await deployApp(TEST_ORG_ID, validAppSpec(), "server-4");

    expect(result.deployment.status).toBe("executing");

    const initialDeployments = await repo.deployments.listForApp(
      TEST_ORG_ID,
      result.app.id,
    );
    const dep = initialDeployments[0];
    expect(dep.id).toBe(result.deployment.id);
    expect(dep.status).toBe("executing");
  });
});
