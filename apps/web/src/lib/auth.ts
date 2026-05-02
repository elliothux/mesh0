import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
} from "@mesh0/sdk/auth";
import type { User } from "@mesh0/sdk/types";
import { ORPCError } from "@orpc/client";
import { redirect } from "@tanstack/react-router";
import {
  getRequestHeader,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { apiClient } from "./api";
import { getSetCookieValues } from "./headers";

async function getCurrentUser(): Promise<User | null> {
  const cookie = getRequestHeader("cookie");
  if (cookie === undefined || !hasAuthCookie(cookie)) {
    return null;
  }

  const responseHeaders = new Headers();

  try {
    const user = await apiClient.user.me(undefined, {
      context: { cookie, responseHeaders },
    });
    forwardSetCookieHeaders(responseHeaders);

    return user;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      forwardSetCookieHeaders(responseHeaders);

      if (import.meta.env.DEV) {
        console.warn(`user.me unauthorized: ${error.message}`);
      }

      return null;
    }

    throw error;
  }
}

function forwardSetCookieHeaders(headers: Headers) {
  const cookies = getSetCookieValues(headers);
  if (cookies.length > 0) {
    setResponseHeader("set-cookie", cookies);
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

function hasAuthCookie(cookieHeader: string) {
  return (
    hasCookie(cookieHeader, AUTH_ACCESS_TOKEN_COOKIE) ||
    hasCookie(cookieHeader, AUTH_REFRESH_TOKEN_COOKIE)
  );
}
