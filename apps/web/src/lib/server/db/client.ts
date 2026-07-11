import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";
import { DATABASE_URL } from "$env/static/private";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
});

export const db = drizzle({ client: pool, schema });

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
