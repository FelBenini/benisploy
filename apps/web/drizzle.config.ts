import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/lib/server/db/migrations",
  schema: "./src/lib/server/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string
  },
});
