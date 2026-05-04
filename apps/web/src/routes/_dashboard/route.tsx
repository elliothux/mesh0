import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  AccountHeaderAction,
  SiteHeader,
  type SiteHeaderItem,
} from "../../components/site-header";
import { orpc } from "../../lib/api";

const dashboardTabs = [
  { label: "Runs", to: "/runs" },
  { label: "API Keys", to: "/keys" },
] satisfies SiteHeaderItem[];
const dashboardAccountPlaceholder = (
  <span
    aria-hidden="true"
    className="h-10 w-40 border border-[var(--mesh-line)] bg-black/20"
  />
);

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
  shouldReload: false,
});

function DashboardLayout() {
  return (
    <DashboardShell action={<DashboardAccountAction />}>
      <Outlet />
    </DashboardShell>
  );
}

function DashboardAccountAction() {
  const navigate = useNavigate();
  const userQuery = useQuery(orpc.user.me.queryOptions());
  const unauthorized = isUnauthorizedError(userQuery.error);

  useEffect(() => {
    if (unauthorized) {
      void navigate({ replace: true, to: "/" });
    }
  }, [navigate, unauthorized]);

  if (userQuery.isLoading) {
    return dashboardAccountPlaceholder;
  }

  if (unauthorized) {
    return dashboardAccountPlaceholder;
  }

  if (userQuery.isError) {
    throw userQuery.error;
  }

  if (userQuery.data === undefined) {
    return dashboardAccountPlaceholder;
  }

  return <AccountHeaderAction user={userQuery.data} />;
}

function isUnauthorizedError(error: Error | null) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "UNAUTHORIZED"
  );
}

function DashboardShell({
  action,
  children,
}: {
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-[var(--mesh-black)] font-mono text-[var(--mesh-white)]">
      <SiteHeader
        action={action}
        items={dashboardTabs}
        logoHref="/"
        variant="dashboard"
      />
      {children}
    </div>
  );
}
