import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const orgs = pgTable(
  "orgs",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orgs_name_idx").on(table.name),
    index("orgs_created_idx").on(table.createdAt),
  ],
);
