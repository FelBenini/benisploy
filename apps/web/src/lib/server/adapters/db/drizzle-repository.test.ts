import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { DrizzleRepository } from "./drizzle-repository";
import { createRegisterServer } from "../../usecase/register-server";
import { createDeployApp } from "../../usecase/deploy-app";
import { createGetApp } from "../../usecase/get-app";
import { createListApps } from "../../usecase/list-apps";
import { validAppSpec, FakeNodeAgentClient } from "../../usecase/test-utils";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: NodePgDatabase<typeof schema>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("benisploy_test")
    .withUsername("benisploy")
    .withPassword("benisploy-test")
    .start();

  pool = new Pool({
    connectionString: container.getConnectionUri(),
  });

  db = drizzle({ client: pool, schema }) as NodePgDatabase<typeof schema>;

  await migrate(db, {
    migrationsFolder: "./src/lib/server/db/migrations",
  });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
}, 30_000);

async function seedOrg(id: string) {
  await db.insert(schema.orgs).values({
    id,
    name: "Org " + id,
    slug: id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("DrizzleRepository integration", () => {
  it("registerServer creates a server in Postgres", async () => {
    const ORG = "reg-server-org";
    await seedOrg(ORG);

    const repo = new DrizzleRepository(db);
    const registerServer = createRegisterServer(repo);

    const server = await registerServer(ORG, {
      name: "integration-server",
      address: "10.0.0.100",
      cpuCores: 4,
      memoryBytes: 8_000_000_000,
      diskBytes: 100_000_000_000,
    });

    expect(server.id).toBeDefined();
    expect(server.name).toBe("integration-server");
    expect(server.status).toBe("offline");

    const stored = await repo.servers.get(ORG, server.id);
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe("integration-server");
  });

  it("deployApp creates app and deployment in Postgres", async () => {
    const ORG = "deploy-org";
    await seedOrg(ORG);

    const repo = new DrizzleRepository(db);
    const registerServer = createRegisterServer(repo);
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);

    const server = await registerServer(ORG, {
      name: "deploy-target",
      address: "10.0.0.1",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    });

    const result = await deployApp(
      ORG,
      validAppSpec({ name: "int-app" }),
      server.id,
    );

    expect(result.app.name).toBe("int-app");
    expect(result.app.status).toBe("deploying");
    expect(result.deployment.version).toBe(1);
    expect(result.deployment.status).toBe("executing");

    const stored = await repo.apps.get(ORG, result.app.id);
    expect(stored).not.toBeNull();

    const deployments = await repo.deployments.listForApp(ORG, result.app.id);
    expect(deployments).toHaveLength(1);
  });

  it("getApp returns app with latest deployment", async () => {
    const ORG = "get-app-org";
    await seedOrg(ORG);

    const repo = new DrizzleRepository(db);
    const registerServer = createRegisterServer(repo);
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);
    const getApp = createGetApp(repo);

    const server = await registerServer(ORG, {
      name: "get-target",
      address: "10.0.0.2",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    });

    const { app } = await deployApp(
      ORG,
      validAppSpec({ name: "get-app-test" }),
      server.id,
    );

    const result = await getApp(ORG, app.id);
    expect(result).not.toBeNull();
    expect(result!.app.name).toBe("get-app-test");
    expect(result!.currentDeployment).not.toBeNull();
    expect(result!.currentDeployment!.version).toBe(1);
  });

  it("listApps returns all apps in the org", async () => {
    const ORG = "list-app-org";
    await seedOrg(ORG);

    const repo = new DrizzleRepository(db);
    const registerServer = createRegisterServer(repo);
    const nodeAgent = new FakeNodeAgentClient();
    const deployApp = createDeployApp(repo, nodeAgent);
    const listApps = createListApps(repo);

    const serverA = await registerServer(ORG, {
      name: "list-srv-a",
      address: "10.0.0.3",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    });
    const serverB = await registerServer(ORG, {
      name: "list-srv-b",
      address: "10.0.0.4",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    });

    await deployApp(ORG, validAppSpec({ name: "list-a" }), serverA.id);
    await deployApp(ORG, validAppSpec({ name: "list-b" }), serverB.id);

    const apps = await listApps(ORG);
    const names = apps
      .map((a) => a.name)
      .filter((n) => n.startsWith("list-"))
      .sort();
    expect(names).toEqual(["list-a", "list-b"]);
  });

  it("scopes queries to the org", async () => {
    await seedOrg("org-alpha");
    await seedOrg("org-beta");

    const repo = new DrizzleRepository(db);
    const registerServer = createRegisterServer(repo);

    await registerServer("org-alpha", {
      name: "alpha-server",
      address: "10.0.0.1",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    });

    const alphaServers = await repo.servers.list("org-alpha");
    const betaServers = await repo.servers.list("org-beta");

    expect(alphaServers).toHaveLength(1);
    expect(betaServers).toHaveLength(0);
  });
});
