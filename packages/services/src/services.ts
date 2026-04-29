import type { RunnerSandbox } from "@mesh0/adapters";
import { RunService } from "./run";
import { StatusService } from "./status";
import { UserService } from "./user";

import type { Db } from "@mesh0/db";

export class Services {
  readonly run: RunService;
  readonly status: StatusService;
  readonly user: UserService;

  constructor({ db, sandbox }: { db: Db; sandbox?: RunnerSandbox }) {
    this.run = new RunService(db, sandbox);
    this.status = new StatusService(db);
    this.user = new UserService(db);
  }
}
