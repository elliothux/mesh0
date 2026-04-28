import { appStatus } from "@mesh0/db/schema";

import type { Db } from "@mesh0/db";

export class StatusService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  list() {
    return this.#db.select().from(appStatus);
  }
}
