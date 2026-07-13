import { describe, it, expect } from "vitest";
import { InMemoryRepository, validAppSpec } from "./test-utils";
import { createGetApp } from "./get-app";
import { createDeployApp } from "./deploy-app";
import { FakeNodeAgentClient } from "./test-utils";
import type { App } from "../domain/app";

describe("getApp", () => {
  it("returns null for a non-existent app", async () => {
    const repo = new InMemoryRepository();
    const getApp = createGetApp(repo);

    const result = await getApp("non-existent-id");
    expect(result).toBeNull();
  });

  it("returns an existing app with its current deployment", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);
    const getApp = createGetApp(repo);

    const deployResult = await deployApp(
      validAppSpec({ name: "my-app" }),
      "server-1",
    );

    const result = await getApp(deployResult.app.id);

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
    await repo.createApp(app);

    const result = await getApp("app-no-deploy");
    expect(result).not.toBeNull();
    expect(result!.currentDeployment).toBeNull();
  });
});
