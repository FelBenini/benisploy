import type { DbExecutor, OrgRepository } from "../../ports/repository";
import type { Org } from "../../domain/org";
import type { DrizzleDB } from "./drizzle-repository";
import { orgs } from "../../db/schema";

function toDomain(row: typeof orgs.$inferSelect): Org {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrgRepository implements OrgRepository {
  constructor(private db: DrizzleDB) {}

  async create(db: DbExecutor, org: Org): Promise<Org> {
    const [row] = await (db
      .insert(orgs)
      .values({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      })
      .returning() as Promise<(typeof orgs.$inferSelect)[]>);
    return toDomain(row);
  }
}
