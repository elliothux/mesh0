import { RunService } from "./run";
import { StatusService } from "./status";

import type { Db } from "@mesh0/db";

export class Services {
  readonly run: RunService;
  readonly status: StatusService;

  constructor({ db }: { db: Db }) {
    this.run = new RunService(db);
    this.status = new StatusService(db);
  }
}
