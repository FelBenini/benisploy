import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

export const servers = pgTable(
  "servers",
  {
    id: text().primaryKey(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    address: text().notNull(),
    sshPort: integer().notNull().default(22),
    sshUser: text().notNull().default("root"),
    sshPrivateKey: text().notNull(),
    status: text().notNull().default("offline"),
    cpuCores: integer().notNull(),
    memoryBytes: bigint({ mode: "number" }).notNull(),
    diskBytes: bigint({ mode: "number" }).notNull(),
    labels: jsonb().notNull().default({}),
    lastHeartbeatAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("servers_org_idx").on(table.orgId),
    index("servers_org_status_idx").on(table.orgId, table.status),
    index("servers_org_name_idx").on(table.orgId, table.name),
  ],
);
