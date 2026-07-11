import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

export const deployments = pgTable(
  "deployments",
  {
    id: text().primaryKey(),
    appId: text()
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    status: text().notNull().default("pending"),
    appSpec: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("deployments_app_idx").on(table.appId),
    index("deployments_app_status_idx").on(table.appId, table.status),
    index("deployments_app_created_idx").on(table.appId, table.createdAt),
    uniqueIndex("deployments_app_version_idx").on(table.appId, table.version),
  ],
);
