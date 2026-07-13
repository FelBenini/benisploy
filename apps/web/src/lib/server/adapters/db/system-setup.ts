import { eq } from "drizzle-orm";
import type { SystemSetupRepository } from "../../ports/repository";
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
    return row?.configured ?? false;
  }

  async markAsConfigured(): Promise<void> {
    await this.db
      .insert(systemSetup)
      .values({ id: 1, configured: true, setupAt: new Date() })
      .onConflictDoUpdate({
        target: systemSetup.id,
        set: { configured: true, setupAt: new Date() },
      });
  }
}
