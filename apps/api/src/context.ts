import type { Db } from "@mesh0/db";
import { os } from "@orpc/server";

export type Context = { db: Db };

export const procedure = os.$context<Context>();
