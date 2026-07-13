import { eq } from "drizzle-orm";
import type { OrgMembershipRepository } from "../../ports/repository";
import type { OrgMembership } from "../../domain/org-membership";
import type { DrizzleDB } from "./drizzle-repository";
import { orgMemberships } from "../../db/schema";

function toDomain(row: typeof orgMemberships.$inferSelect): OrgMembership {
  return {
    userId: row.userId,
    orgId: row.orgId,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export class DrizzleOrgMembershipRepository implements OrgMembershipRepository {
  constructor(private db: DrizzleDB) {}

  async create(membership: OrgMembership): Promise<OrgMembership> {
    const [row] = await this.db
      .insert(orgMemberships)
      .values({
        userId: membership.userId,
        orgId: membership.orgId,
        role: membership.role,
        createdAt: membership.createdAt,
      })
      .returning();
    return toDomain(row);
  }

  async findByUserId(userId: string): Promise<OrgMembership | null> {
    const [row] = await this.db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.userId, userId))
      .limit(1);
    return row ? toDomain(row) : null;
  }
}
