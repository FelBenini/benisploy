import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

export const auditLog = pgTable(
  "audit_log",
  {
    id: text().primaryKey(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorId: text().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    resource: text().notNull(),
    resourceId: text(),
    details: jsonb(),
    reasoning: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.orgId),
    index("audit_log_org_created_idx").on(table.orgId, table.createdAt),
    index("audit_log_org_action_idx").on(table.orgId, table.action),
    index("audit_log_actor_idx").on(table.actorId),
    index("audit_log_resource_idx").on(
      table.resource,
      table.resourceId,
      table.createdAt,
    ),
  ],
);
