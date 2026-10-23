import { Pool } from "pg";
import { Subscription } from "./types";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class SubscriptionStore {
  async upsert(input: Omit<Subscription, "createdAt" | "updatedAt">): Promise<Subscription> {
    const now = new Date().toISOString();

    const sql = `
      insert into subscriptions (group_id, user_id, user_name, expiry_date, plan_name, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $6)
      on conflict (group_id, user_id)
      do update set
        user_name = excluded.user_name,
        expiry_date = excluded.expiry_date,
        plan_name = excluded.plan_name,
        updated_at = excluded.updated_at
      returning *
    `;

    const result = await pool.query(sql, [
      input.groupId,
      input.userId,
      input.userName,
      input.expiryDate,
      input.planName ?? null,
      now
    ]);

    const row = result.rows[0];
    return {
      groupId: row.group_id,
      userId: row.user_id,
      userName: row.user_name,
      expiryDate: row.expiry_date,
      planName: row.plan_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async remove(groupId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      "delete from subscriptions where group_id = $1 and user_id = $2 returning *",
      [groupId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listByGroup(groupId: string): Promise<Subscription[]> {
    const result = await pool.query(
      "select * from subscriptions where group_id = $1 order by expiry_date asc",
      [groupId]
    );

    return result.rows.map((row) => ({
      groupId: row.group_id,
      userId: row.user_id,
      userName: row.user_name,
      expiryDate: row.expiry_date,
      planName: row.plan_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async getByGroupAndUser(groupId: string, userId: string): Promise<Subscription | undefined> {
    const result = await pool.query(
      "select * from subscriptions where group_id = $1 and user_id = $2",
      [groupId, userId]
    );

    if (result.rowCount === 0) return undefined;

    const row = result.rows[0];
    return {
      groupId: row.group_id,
      userId: row.user_id,
      userName: row.user_name,
      expiryDate: row.expiry_date,
      planName: row.plan_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listGroupIds(): Promise<string[]> {
    const result = await pool.query("select distinct group_id from subscriptions");
    return result.rows.map((row) => row.group_id);
  }
}