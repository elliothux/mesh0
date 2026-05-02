import { AUTH_ACCESS_TOKEN_COOKIE } from "@mesh0/sdk/auth";
import type { User } from "@mesh0/sdk/types";
import { ORPCError } from "@orpc/client";
import { redirect } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { apiClient } from "./api";

export async function getCurrentUser(): Promise<User | null> {
  const cookie = getRequestHeader("cookie");
  if (cookie === undefined || !hasCookie(cookie, AUTH_ACCESS_TOKEN_COOKIE)) {
    return null;
  }

  try {
    return await apiClient.user.me(undefined, {
      context: { cookie },
    });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      if (import.meta.env.DEV) {
        console.warn(`user.me unauthorized: ${error.message}`);
      }

      return null;
    }

    throw error;
  }
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user === null) {
    throw redirect({ to: "/" });
  }

  return user;
}

function hasCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${name}=`));
}
