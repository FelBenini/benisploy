import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { orgs } from "./orgs";

export const orgMemberships = pgTable(
  "memberships",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: text().notNull().default("member"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_user_org_idx").on(table.userId, table.orgId),
    index("memberships_user_idx").on(table.userId),
    index("memberships_org_idx").on(table.orgId),
  ],
);
