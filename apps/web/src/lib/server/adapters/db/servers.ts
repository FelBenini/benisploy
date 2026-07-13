import { eq, and } from "drizzle-orm";
import type { ServerRepository } from "../../ports/repository";
import type { Server } from "../../domain/server";
import type { DrizzleDB } from "./drizzle-repository";
import { servers } from "../../db/schema";

function toDomain(row: typeof servers.$inferSelect): Server {
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

export class DrizzleServerRepository implements ServerRepository {
  constructor(private db: DrizzleDB) {}

  async create(orgId: string, input: Server): Promise<Server> {
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
    return toDomain(row);
  }

  async get(orgId: string, id: string): Promise<Server | null> {
    const [row] = await this.db
      .select()
      .from(servers)
      .where(and(eq(servers.id, id), eq(servers.orgId, orgId)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async list(orgId: string): Promise<Server[]> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(eq(servers.orgId, orgId));
    return rows.map(toDomain);
  }

  async updateStatus(orgId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(servers)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(servers.id, id), eq(servers.orgId, orgId)));
  }
}
