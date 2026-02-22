import type { Database } from "../db/index.js";
import { eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

export class BaseModel<T extends object> {
  protected table: PgTable<any>;
  protected idColumn: AnyPgColumn;

  constructor(table: PgTable<any>, idColumn: AnyPgColumn) {
    this.table = table;
    this.idColumn = idColumn;
  }

  async findById(db: Database, id: string | number): Promise<T | null> {
    const records = await db.select().from(this.table).where(eq(this.idColumn, id));
    return records.length > 0 ? (records[0] as T) : null;
  }

  async findAll(db: Database): Promise<T[]> {
    return (await db.select().from(this.table)) as T[];
  }

  async create(db: Database, data: Partial<T>): Promise<T> {
    const records = await db.insert(this.table).values(data).returning();
    return records[0] as T;
  }

  async update(db: Database, id: string | number, data: Partial<T>): Promise<T | null> {
    const records = await db.update(this.table).set(data).where(eq(this.idColumn, id)).returning();
    return records.length > 0 ? (records[0] as T) : null;
  }

  async delete(db: Database, id: string | number): Promise<{ success: boolean; message?: string }> {
    const record = await this.findById(db, id);
    if (!record) return { success: false, message: "Record not found" };
    await db.delete(this.table).where(eq(this.idColumn, id));
    return { success: true };
  }
}
