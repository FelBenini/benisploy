import {
  pgTable,
  text,
  timestamp,
  customType,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value);
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secretHash: bytea("secret_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);
