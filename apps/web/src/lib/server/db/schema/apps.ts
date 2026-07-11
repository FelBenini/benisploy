import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { servers } from "./servers";

export const apps = pgTable(
  "apps",
  {
    id: text().primaryKey(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    serverId: text()
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: text().notNull(),
    status: text().notNull().default("pending"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("apps_org_idx").on(table.orgId),
    index("apps_server_idx").on(table.serverId),
    index("apps_org_status_idx").on(table.orgId, table.status),
    index("apps_org_name_idx").on(table.orgId, table.name),
    index("apps_org_created_idx").on(table.orgId, table.createdAt),
  ],
);
