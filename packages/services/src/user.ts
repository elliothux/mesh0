import { users } from "@mesh0/db/schema";
import type { User } from "@mesh0/db/types";
import { eq } from "drizzle-orm";

import type { Db } from "@mesh0/db";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

type UpsertUserInput = {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
};

export class UserService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async get(id: string): Promise<User> {
    const [user] = await this.#db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (user === undefined) {
      throw new UserNotFoundError();
    }

    return user;
  }

  async upsert(input: UpsertUserInput): Promise<User> {
    await this.#db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        set: {
          email: input.email,
          emailVerified: input.emailVerified,
          firstName: input.firstName,
          lastName: input.lastName,
          lastSignInAt: input.lastSignInAt,
          profilePictureUrl: input.profilePictureUrl,
          updatedAt: input.updatedAt,
        },
        target: users.id,
      });

    return this.get(input.id);
  }
}
