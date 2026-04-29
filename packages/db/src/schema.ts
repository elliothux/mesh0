import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  input: text("input").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "canceled"],
  }).notNull(),
  artifacts: text("artifacts").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  lastMessage: text("last_message"),
});

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  createdAt: text("created_at").notNull(),
});
