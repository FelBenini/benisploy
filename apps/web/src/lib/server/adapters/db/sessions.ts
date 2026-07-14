import { eq } from "drizzle-orm";
import type { DbExecutor, SessionRepository } from "../../ports/repository";
import type { Session } from "../../domain/session";
import type { DrizzleDB } from "./drizzle-repository";
import { sessions } from "../../db/schema";

function toDomain(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    userId: row.userId,
    secretHash: new Uint8Array(row.secretHash),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private db: DrizzleDB) {}

  async create(db: DbExecutor, session: Session): Promise<Session> {
    const [row] = await (db
      .insert(sessions)
      .values({
        id: session.id,
        userId: session.userId,
        secretHash: Buffer.from(session.secretHash),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })
      .returning() as Promise<(typeof sessions.$inferSelect)[]>);
    return toDomain(row);
  }

  async get(id: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }
}
