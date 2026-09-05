import type { Db } from "@mesh0/db";
import { crons } from "@mesh0/db/schema";
import type { Cron } from "@mesh0/db/types";
import { cronRecordSchema } from "@mesh0/sdk/schema";
import type {
  CreateCronInput,
  CronRecord,
  ListCronsInput,
} from "@mesh0/sdk/types";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

export class CronNotFoundError extends Error {
  constructor() {
    super("Cron not found");
    this.name = "CronNotFoundError";
  }
}

export class CronService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create({
    definition,
    expression,
    invalidateAt,
    name,
    userId,
  }: CreateCronInput & { userId: string }): Promise<CronRecord> {
    const now = new Date().toISOString();
    const cron: Cron = {
      createdAt: now,
      definition: JSON.stringify(definition),
      deletedAt: null,
      expression,
      id: `cron_${nanoid()}`,
      invalidateAt: invalidateAt ?? null,
      lastRunId: null,
      lastTriggeredAt: null,
      name,
      updatedAt: now,
      userId,
    };

    await this.#db.insert(crons).values(cron);
    return parseCron(cron);
  }

  async list({
    limit,
    userId,
  }: ListCronsInput & { userId: string }): Promise<CronRecord[]> {
    const rows = await this.#db
      .select()
      .from(crons)
      .where(and(eq(crons.userId, userId), isNull(crons.deletedAt)))
      .orderBy(desc(crons.updatedAt))
      .limit(limit);

    return rows.map(parseCron);
  }

  async delete({
    cronId,
    userId,
  }: {
    cronId: string;
    userId: string;
  }): Promise<CronRecord> {
    const cron = await this.#getActiveUserCron({ cronId, userId });
    const deletedAt = new Date().toISOString();
    const deletedCron: Cron = {
      ...cron,
      deletedAt,
      updatedAt: deletedAt,
    };

    await this.#db
      .update(crons)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(crons.id, cron.id));

    return parseCron(deletedCron);
  }

  async due({ now }: { now: Date }): Promise<CronRecord[]> {
    const rows = await this.#db
      .select()
      .from(crons)
      .where(isNull(crons.deletedAt))
      .orderBy(desc(crons.updatedAt));
    const currentMinute = minuteIso(now);

    return rows
      .map(parseCron)
      .filter(
        (cron) =>
          cron.invalidateAt === null || cron.invalidateAt > now.toISOString(),
      )
      .filter((cron) => cron.lastTriggeredAt !== currentMinute)
      .filter((cron) => cronExpressionMatches(cron.expression, now));
  }

  async markTriggered({
    cronId,
    runId,
    triggeredAt,
  }: {
    cronId: string;
    runId: string;
    triggeredAt: Date;
  }): Promise<void> {
    const timestamp = minuteIso(triggeredAt);
    await this.#db
      .update(crons)
      .set({
        lastRunId: runId,
        lastTriggeredAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(crons.id, cronId));
  }

  async #getActiveUserCron({
    cronId,
    userId,
  }: {
    cronId: string;
    userId: string;
  }) {
    const [cron] = await this.#db
      .select()
      .from(crons)
      .where(
        and(
          eq(crons.id, cronId),
          eq(crons.userId, userId),
          isNull(crons.deletedAt),
        ),
      )
      .limit(1);

    if (cron === undefined) {
      throw new CronNotFoundError();
    }

    return cron;
  }
}

export function parseCron(cron: Cron): CronRecord {
  return cronRecordSchema.parse({
    createdAt: cron.createdAt,
    deletedAt: cron.deletedAt,
    definition: JSON.parse(cron.definition),
    expression: cron.expression,
    id: cron.id,
    invalidateAt: cron.invalidateAt,
    lastRunId: cron.lastRunId,
    lastTriggeredAt: cron.lastTriggeredAt,
    name: cron.name,
    updatedAt: cron.updatedAt,
    userId: cron.userId,
  });
}

export function cronExpressionMatches(expression: string, date: Date) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have 5 fields: ${expression}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (
    minute === undefined ||
    hour === undefined ||
    dayOfMonth === undefined ||
    month === undefined ||
    dayOfWeek === undefined
  ) {
    throw new Error(`Cron expression must have 5 fields: ${expression}`);
  }

  return (
    fieldMatches(minute, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, date.getUTCHours(), 0, 23) &&
    fieldMatches(dayOfMonth, date.getUTCDate(), 1, 31) &&
    fieldMatches(month, date.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dayOfWeek, date.getUTCDay(), 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number) {
  return field.split(",").some((part) => partMatches(part, value, min, max));
}

function partMatches(part: string, value: number, min: number, max: number) {
  if (part === "*") {
    return true;
  }

  const stepMatch = /^\*\/(\d+)$/.exec(part);
  const step = stepMatch?.[1];
  if (step !== undefined) {
    const stepValue = Number(step);
    return stepValue > 0 && (value - min) % stepValue === 0;
  }

  const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
  const rangeStart = rangeMatch?.[1];
  const rangeEnd = rangeMatch?.[2];
  if (rangeStart !== undefined && rangeEnd !== undefined) {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    return start >= min && end <= max && value >= start && value <= end;
  }

  const exact = Number(part);
  return (
    Number.isInteger(exact) && exact >= min && exact <= max && value === exact
  );
}

function minuteIso(date: Date) {
  return `${date.toISOString().slice(0, 16)}:00.000Z`;
}
