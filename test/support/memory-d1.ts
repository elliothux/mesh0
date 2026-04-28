import type {
  D1Database,
  D1DatabaseSession,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
import { Database, type SQLQueryBindings } from "bun:sqlite";

export function createMemoryD1(sqlite: Database): D1Database {
  return {
    batch<T = unknown>(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
    exec(query: string) {
      sqlite.exec(query);
      return Promise.resolve({ count: 0, duration: 0 });
    },
    prepare(query: string) {
      return new MemoryD1PreparedStatement(sqlite, query);
    },
    withSession() {
      return createMemoryD1Session(sqlite);
    },
  };
}

function createMemoryD1Session(sqlite: Database): D1DatabaseSession {
  return {
    batch<T = unknown>(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
    getBookmark() {
      return null;
    },
    prepare(query: string) {
      return new MemoryD1PreparedStatement(sqlite, query);
    },
  };
}

class MemoryD1PreparedStatement implements D1PreparedStatement {
  readonly #sqlite: Database;
  readonly #query: string;
  readonly #values: SQLQueryBindings[];

  constructor(
    sqlite: Database,
    query: string,
    values: SQLQueryBindings[] = [],
  ) {
    this.#sqlite = sqlite;
    this.#query = query;
    this.#values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new MemoryD1PreparedStatement(
      this.#sqlite,
      this.#query,
      values.map(toSqliteBinding),
    );
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T = Record<string, unknown>>(
    colName?: string,
  ): Promise<T | null> {
    const row = this.#sqlite
      .query<Record<string, unknown>, SQLQueryBindings[]>(this.#query)
      .get(...this.#values);
    if (row === null) {
      return null;
    }

    if (colName !== undefined) {
      return row[colName] as T;
    }

    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const changes = this.#sqlite
      .query<unknown, SQLQueryBindings[]>(this.#query)
      .run(...this.#values);

    return buildD1Result<T>({
      changes: changes.changes,
      lastRowId:
        typeof changes.lastInsertRowid === "bigint"
          ? Number(changes.lastInsertRowid)
          : changes.lastInsertRowid,
      results: [],
    });
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.#sqlite
      .query<T, SQLQueryBindings[]>(this.#query)
      .all(...this.#values);

    return buildD1Result({ results });
  }

  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    const statement = this.#sqlite.query<unknown[], SQLQueryBindings[]>(
      this.#query,
    );
    const rows = statement.values(...this.#values) as T[];
    if (options?.columnNames === true) {
      return [statement.columnNames, ...rows];
    }

    return rows;
  }
}

function buildD1Result<T>({
  changes = 0,
  lastRowId = 0,
  results,
}: {
  changes?: number;
  lastRowId?: number;
  results: T[];
}): D1Result<T> {
  return {
    meta: {
      changed_db: changes > 0,
      changes,
      duration: 0,
      last_row_id: lastRowId,
      rows_read: results.length,
      rows_written: changes,
      size_after: 0,
    },
    results,
    success: true,
  };
}

function toSqliteBinding(value: unknown): SQLQueryBindings {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value === null ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  throw new Error(`Unsupported SQLite binding: ${String(value)}`);
}
