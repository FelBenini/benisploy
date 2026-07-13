import { eq, and } from "drizzle-orm";
import type { AppRepository } from "../../ports/repository";
import type { App } from "../../domain/app";
import type { DrizzleDB } from "./drizzle-repository";
import { apps } from "../../db/schema";

function toDomain(row: typeof apps.$inferSelect): App {
  return {
    id: row.id,
    name: row.name,
    serverId: row.serverId,
    status: row.status as App["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleAppRepository implements AppRepository {
  constructor(private db: DrizzleDB) {}

  async create(orgId: string, data: App): Promise<App> {
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
    return toDomain(row);
  }

  async get(orgId: string, id: string): Promise<App | null> {
    const [row] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async list(orgId: string): Promise<App[]> {
    const rows = await this.db.select().from(apps).where(eq(apps.orgId, orgId));
    return rows.map(toDomain);
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(apps)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)));
  }

  async delete(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(apps)
      .where(and(eq(apps.id, id), eq(apps.orgId, orgId)));
  }
}
