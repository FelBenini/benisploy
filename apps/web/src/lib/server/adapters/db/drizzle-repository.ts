import { eq, desc, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { App } from "../../domain/app";
import type { AppSpec } from "../../domain/app-spec";
import type { Deployment } from "../../domain/deployment";
import type { Server } from "../../domain/server";
import type { User } from "../../domain/user";
import type { Repository } from "../../ports/repository";
import * as schema from "../../db/schema";
import { servers, apps, deployments, users } from "../../db/schema";

export type DrizzleDB = NodePgDatabase<typeof schema>;

function toDomainServer(row: typeof servers.$inferSelect): Server {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    status: row.status as Server["status"],
    cpuCores: row.cpuCores,
    memoryBytes: row.memoryBytes,
    diskBytes: row.diskBytes,
    labels: row.labels as Record<string, string>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDomainApp(row: typeof apps.$inferSelect): App {
  return {
    id: row.id,
    name: row.name,
    serverId: row.serverId,
    status: row.status as App["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDomainDeployment(
  depRow: typeof deployments.$inferSelect,
  serverId: string,
): Deployment {
  return {
    id: depRow.id,
    appId: depRow.appId,
    serverId,
    status: depRow.status as Deployment["status"],
    appSpec: depRow.appSpec as unknown as AppSpec,
    version: depRow.version,
    createdAt: depRow.createdAt.toISOString(),
    updatedAt: depRow.updatedAt.toISOString(),
  };
}

function toDomainUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleRepository implements Repository {
  private db: DrizzleDB;

  constructor(database: DrizzleDB) {
    this.db = database;
  }

  async createServer(orgId: string, input: Server): Promise<Server> {
    const [row] = await this.db
      .insert(servers)
      .values({
        id: input.id,
        orgId,
        name: input.name,
        address: input.address,
        status: input.status,
        cpuCores: input.cpuCores,
        memoryBytes: input.memoryBytes,
        diskBytes: input.diskBytes,
        labels: input.labels,
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.updatedAt),
      })
      .returning();
    return toDomainServer(row);
  }

  async getServer(orgId: string, id: string): Promise<Server | null> {
    const [row] = await this.db
      .select()
      .from(servers)
      .where(and(eq(servers.id, id), eq(servers.orgId, orgId)))
      .limit(1);
    return row ? toDomainServer(row) : null;
  }

  async listServers(orgId: string): Promise<Server[]> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(eq(servers.orgId, orgId));
    return rows.map(toDomainServer);
  }

  async updateServerStatus(
    orgId: string,
    id: string,
    status: string,
  ): Promise<void> {
    await this.db
      .update(servers)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(servers.id, id), eq(servers.orgId, orgId)));
  }

  async createApp(orgId: string, data: App): Promise<App> {
    const [row] = await this.db
      .insert(apps)
      .values({
        id: data.id,
        orgId,
        serverId: data.serverId,
        name: data.name,
        status: data.status,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      })
      .returning();
    return toDomainApp(row);
  }

  async getApp(orgId: string, id: string): Promise<App | null> {
    const [row] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)))
      .limit(1);
    return row ? toDomainApp(row) : null;
  }

  async listApps(orgId: string): Promise<App[]> {
    const rows = await this.db.select().from(apps).where(eq(apps.orgId, orgId));
    return rows.map(toDomainApp);
  }

  async updateAppStatus(
    orgId: string,
    id: string,
    status: string,
  ): Promise<void> {
    await this.db
      .update(apps)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)));
  }

  async deleteApp(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)));
  }

  async createDeployment(orgId: string, data: Deployment): Promise<Deployment> {
    const [row] = await this.db
      .insert(deployments)
      .values({
        id: data.id,
        appId: data.appId,
        version: data.version,
        status: data.status,
        appSpec: data.appSpec as Record<string, unknown>,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      })
      .returning();
    return toDomainDeployment(row, data.serverId);
  }

  async getDeploymentsForApp(
    orgId: string,
    appId: string,
  ): Promise<Deployment[]> {
    const rows = await this.db
      .select()
      .from(deployments)
      .innerJoin(apps, eq(deployments.appId, apps.id))
      .where(and(eq(deployments.appId, appId), eq(apps.orgId, orgId)))
      .orderBy(desc(deployments.version));

    return rows.map((r) => toDomainDeployment(r.deployments, r.apps.serverId));
  }

  async getLatestDeployment(
    orgId: string,
    appId: string,
  ): Promise<Deployment | null> {
    const rows = await this.db
      .select()
      .from(deployments)
      .innerJoin(apps, eq(deployments.appId, apps.id))
      .where(and(eq(deployments.appId, appId), eq(apps.orgId, orgId)))
      .orderBy(desc(deployments.version))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return toDomainDeployment(r.deployments, r.apps.serverId);
  }

  async updateDeploymentStatus(
    orgId: string,
    id: string,
    status: string,
  ): Promise<void> {
    await this.db
      .update(deployments)
      .set({ status, updatedAt: new Date() })
      .where(eq(deployments.id, id));
  }

  async createUser(orgId: string, user: User): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        passwordHash: "",
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(),
      })
      .returning();
    return toDomainUser(row);
  }

  async getUser(orgId: string, id: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toDomainUser(row) : null;
  }

  async getUserByEmail(orgId: string, email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? toDomainUser(row) : null;
  }
}
