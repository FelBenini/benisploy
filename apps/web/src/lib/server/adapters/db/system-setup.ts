import { eq } from "drizzle-orm";
import type { DbExecutor, SystemSetupRepository } from "../../ports/repository";
import type { DrizzleDB } from "./drizzle-repository";
import { systemSetup } from "../../db/schema";

export class DrizzleSystemSetupRepository implements SystemSetupRepository {
  constructor(private db: DrizzleDB) {}

  async isConfigured(): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(systemSetup)
      .where(eq(systemSetup.id, 1))
      .limit(1);
    return row !== undefined;
  }

  async tryAcquire(db: DbExecutor): Promise<boolean> {
    const result = await (db
      .insert(systemSetup)
      .values({ id: 1, setupAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: systemSetup.id }) as Promise<{ id: number }[]>);
    return result.length === 1;
  }
}
