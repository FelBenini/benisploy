import { describe, it, expect } from "vitest";
import {
  InMemoryRepository,
  validAppSpec,
  FakeNodeAgentClient,
  TEST_ORG_ID,
} from "./test-utils";
import { createListApps } from "./list-apps";
import { createDeployApp } from "./deploy-app";

describe("listApps", () => {
  it("returns an empty array when no apps exist", async () => {
    const repo = new InMemoryRepository();
    const listApps = createListApps(repo);

    const apps = await listApps(TEST_ORG_ID);
    expect(apps).toEqual([]);
  });

  it("returns all deployed apps", async () => {
    const repo = new InMemoryRepository();
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);
    const listApps = createListApps(repo);

    await deployApp(TEST_ORG_ID, validAppSpec({ name: "app-one" }), "server-1");
    await deployApp(TEST_ORG_ID, validAppSpec({ name: "app-two" }), "server-2");
    await deployApp(
      TEST_ORG_ID,
      validAppSpec({ name: "app-three" }),
      "server-1",
    );

    const apps = await listApps(TEST_ORG_ID);

    expect(apps).toHaveLength(3);
    const names = apps.map((a) => a.name).sort();
    expect(names).toEqual(["app-one", "app-three", "app-two"]);
  });
});
