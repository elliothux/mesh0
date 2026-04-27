import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

import type { AnyD1Database, DrizzleD1Database } from "drizzle-orm/d1";

export function createDb(d1: AnyD1Database) {
  return drizzle(d1, { schema });
}

export type Db = DrizzleD1Database<typeof schema>;
