import { BaseModel } from "./base.model.ts";
import { users } from "../db/schema.ts";
import type { Database } from "../db/index.ts";
import { eq } from "drizzle-orm";

export interface User {
  id: number;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
}

export class UsersModel extends BaseModel<User> {
  constructor() {
    super(users, users.id);
  }

  async findByClerkId(db: Database, clerkId: string): Promise<User | null> {
    const results = await db.select().from(users).where(eq(users.clerkId, clerkId));
    return results.length > 0 ? results[0] : null;
  }

  async findOrCreate(
    db: Database,
    clerkId: string,
    data: { email: string; firstName?: string | null; lastName?: string | null }
  ): Promise<User> {
    const existing = await this.findByClerkId(db, clerkId);
    if (existing) return existing;

    const inserted = await db
      .insert(users)
      .values({ clerkId, ...data, createdAt: new Date() })
      .returning();
    return inserted[0];
  }
}
