import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Landing } from "../components/landing";
import { apiUrl, orpc, queryClient } from "../lib/api";

const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("../lib/auth");
  const { getRequestUrl } = await import("@tanstack/react-start/server");
  const requestUrl = getRequestUrl();
  const nextUrl = new URL("/dashboard", requestUrl.origin);
  const loginUrl = new URL("/auth/login", apiUrl);
  loginUrl.searchParams.set("next", nextUrl.toString());

  return {
    isAuthenticated: (await getCurrentUser()) !== null,
    loginUrl: loginUrl.toString(),
  };
});

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    await queryClient.prefetchQuery(orpc.status.list.queryOptions());
    return getAuthState();
  },
});

function Home() {
  const { isAuthenticated, loginUrl } = Route.useLoaderData();
  const { data: statuses } = useSuspenseQuery(orpc.status.list.queryOptions());

  return (
    <Landing
      apiStatusCount={statuses.length}
      isAuthenticated={isAuthenticated}
      loginUrl={loginUrl}
    />
  );
}
