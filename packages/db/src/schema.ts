import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appStatus = sqliteTable("app_status", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profilePictureUrl: text("profile_picture_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastSignInAt: text("last_sign_in_at"),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  secretHash: text("secret_hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
});

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "canceled"],
    }).notNull(),
    artifacts: text("artifacts").notNull(),
    runnerTokenHash: text("runner_token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    lastMessage: text("last_message"),
  },
  (table) => [
    index("agent_runs_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const agentRunEvents = sqliteTable(
  "agent_run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    eventType: text("event_type"),
    itemId: text("item_id"),
    itemStatus: text("item_status"),
    itemType: text("item_type"),
    event: text("event").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("agent_run_events_run_id_id_idx").on(table.runId, table.id),
    index("agent_run_events_run_id_event_type_idx").on(
      table.runId,
      table.eventType,
    ),
  ],
);
