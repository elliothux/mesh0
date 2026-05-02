import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "../components/landing";
import { orpc, queryClient } from "../lib/api";

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    await queryClient.prefetchQuery(orpc.status.list.queryOptions());
  },
});

function Home() {
  const { data: statuses } = useSuspenseQuery(orpc.status.list.queryOptions());

  return <Landing apiStatusCount={statuses.length} />;
}
