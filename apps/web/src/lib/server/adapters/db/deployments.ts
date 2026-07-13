import { eq, desc, and } from "drizzle-orm";
import type { DeploymentRepository } from "../../ports/repository";
import type { Deployment } from "../../domain/deployment";
import type { AppSpec } from "../../domain/app-spec";
import type { DrizzleDB } from "./drizzle-repository";
import { deployments, apps } from "../../db/schema";

function toDomain(
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

export class DrizzleDeploymentRepository implements DeploymentRepository {
  constructor(private db: DrizzleDB) {}

  async create(orgId: string, data: Deployment): Promise<Deployment> {
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
    return toDomain(row, data.serverId);
  }

  async listForApp(orgId: string, appId: string): Promise<Deployment[]> {
    const rows = await this.db
      .select()
      .from(deployments)
      .innerJoin(apps, eq(deployments.appId, apps.id))
      .where(and(eq(deployments.appId, appId), eq(apps.orgId, orgId)))
      .orderBy(desc(deployments.version));

    return rows.map((r) => toDomain(r.deployments, r.apps.serverId));
  }

  async getLatest(orgId: string, appId: string): Promise<Deployment | null> {
    const rows = await this.db
      .select()
      .from(deployments)
      .innerJoin(apps, eq(deployments.appId, apps.id))
      .where(and(eq(deployments.appId, appId), eq(apps.orgId, orgId)))
      .orderBy(desc(deployments.version))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return toDomain(r.deployments, r.apps.serverId);
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(deployments)
      .set({ status, updatedAt: new Date() })
      .where(eq(deployments.id, id));
  }
}
