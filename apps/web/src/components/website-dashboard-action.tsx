"use client";

import { ORPCError } from "@orpc/client";
import { useEffect, useState } from "react";
import { apiClient, apiUrl } from "../lib/api";
import { WebsiteHeaderAction } from "./site-header";

type ActionState = {
  label: string;
  loading: boolean;
} & (
  | {
      href: string;
      to?: never;
    }
  | {
      href?: never;
      to: "/runs";
    }
);

const loadingState = {
  href: "#",
  label: "Loading",
  loading: true,
} satisfies ActionState;

export function WebsiteDashboardAction() {
  const [error, setError] = useState<unknown>(null);
  const [state, setState] = useState<ActionState>(loadingState);

  if (error !== null) {
    throw error;
  }

  useEffect(() => {
    let cancelled = false;

    apiClient.user
      .me(undefined)
      .then(() => {
        if (!cancelled) {
          setState({ label: "Dashboard", loading: false, to: "/runs" });
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }

        if (caught instanceof ORPCError && caught.code === "UNAUTHORIZED") {
          setState({
            href: createLoginUrl(),
            label: "Sign In",
            loading: false,
          });
          return;
        }

        setError(caught);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <WebsiteHeaderAction {...state} />;
}

function createLoginUrl() {
  const nextUrl = new URL("/runs", window.location.origin);
  const loginUrl = new URL("/auth/login", apiUrl);
  loginUrl.searchParams.set("next", nextUrl.toString());

  return loginUrl.toString();
}
