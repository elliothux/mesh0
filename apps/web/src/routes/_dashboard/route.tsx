import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  AccountHeaderAction,
  SiteHeader,
  type SiteHeaderItem,
} from "../../components/site-header";

const dashboardTabs = [
  { label: "Runs", to: "/runs" },
  { label: "Artifacts", to: "/artifacts" },
  { label: "Observability", to: "/observability" },
  { label: "API Keys", to: "/keys" },
] satisfies SiteHeaderItem[];

const loadDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../../lib/auth");

  return { user: await requireCurrentUser() };
});

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
  loader: () => loadDashboard(),
});

function DashboardLayout() {
  const { user } = Route.useLoaderData();

  return (
    <div className="min-h-svh bg-[var(--mesh-black)] font-mono text-[var(--mesh-white)]">
      <SiteHeader
        action={<AccountHeaderAction user={user} />}
        items={dashboardTabs}
        logoHref="/"
        variant="dashboard"
      />
      <Outlet />
    </div>
  );
}
