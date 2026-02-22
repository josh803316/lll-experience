import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDB>;

let db: Database | null = null;

export const createDB = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const client = postgres(databaseUrl, {
    prepare: false, // Supabase transaction pooler doesn't support prepared statements
  });
  return drizzle(client, { schema });
};

export const getDB = (): Database => {
  if (!db) {
    db = createDB();
  }
  return db;
};
