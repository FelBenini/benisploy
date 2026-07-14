import { eq } from "drizzle-orm";
import type { DbExecutor, UserRepository } from "../../ports/repository";
import type { User } from "../../domain/user";
import type { DrizzleDB } from "./drizzle-repository";
import { users } from "../../db/schema";

function toDomain(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private db: DrizzleDB) {}

  async create(
    db: DbExecutor,
    orgId: string,
    user: User,
    passwordHash?: string,
  ): Promise<User> {
    const [row] = await (db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        passwordHash: passwordHash ?? "",
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(),
      })
      .returning() as Promise<(typeof users.$inferSelect)[]>);
    return toDomain(row);
  }

  async get(orgId: string, id: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async getByEmail(orgId: string, email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async getPasswordHashByEmail(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!row) return null;
    return {
      user: toDomain(row),
      passwordHash: row.passwordHash,
    };
  }
}
