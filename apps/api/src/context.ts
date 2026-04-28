import { os } from "@orpc/server";

import type { Services } from "@mesh0/services";

export type Context = { services: Services };

export const procedure = os.$context<Context>();
