import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { apps } from "./apps";

export const envVars = pgTable(
  "env_vars",
  {
    id: text().primaryKey(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    appId: text()
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    key: text().notNull(),
    encryptedValue: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("env_vars_app_key_idx").on(table.appId, table.key),
    index("env_vars_org_idx").on(table.orgId),
  ],
);
