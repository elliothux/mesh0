import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appStatus = sqliteTable("app_status", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
