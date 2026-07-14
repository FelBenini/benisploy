import { pgTable, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const systemSetup = pgTable("system_setup", {
  id: integer().primaryKey().default(1),
  configured: boolean().notNull().default(true),
  setupAt: timestamp("setup_at", { withTimezone: true }),
});
