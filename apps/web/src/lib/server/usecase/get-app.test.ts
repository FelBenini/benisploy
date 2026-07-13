import { describe, it, expect } from "vitest";
import {
  InMemoryRepository,
  validAppSpec,
  FakeNodeAgentClient,
  TEST_ORG_ID,
} from "./test-utils";
import { createGetApp } from "./get-app";
import { createDeployApp } from "./deploy-app";
import type { App } from "../domain/app";

describe("getApp", () => {
  it("returns null for a non-existent app", async () => {
    const repo = new InMemoryRepository();
    const getApp = createGetApp(repo);

    const result = await getApp(TEST_ORG_ID, "non-existent-id");
    expect(result).toBeNull();
  });

  it("returns an existing app with its current deployment", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);
    const getApp = createGetApp(repo);

    const deployResult = await deployApp(
      TEST_ORG_ID,
      validAppSpec({ name: "my-app" }),
      "server-1",
    );

    const result = await getApp(TEST_ORG_ID, deployResult.app.id);

    expect(result).not.toBeNull();
    expect(result!.app.name).toBe("my-app");
    expect(result!.currentDeployment).not.toBeNull();
    expect(result!.currentDeployment!.id).toBe(deployResult.deployment.id);
    expect(result!.currentDeployment!.version).toBe(1);
  });

  it("returns null for currentDeployment when app has no deployments", async () => {
    const repo = new InMemoryRepository();
    const getApp = createGetApp(repo);

    const app: App = {
      id: "app-no-deploy",
      name: "empty-app",
      serverId: "server-1",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.apps.create(TEST_ORG_ID, app);

    const result = await getApp(TEST_ORG_ID, "app-no-deploy");
    expect(result).not.toBeNull();
    expect(result!.currentDeployment).toBeNull();
  });
});
