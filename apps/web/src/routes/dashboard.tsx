import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const loadDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth");

  return { user: await requireCurrentUser() };
});

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  loader: () => loadDashboard(),
});

function Dashboard() {
  const { user } = Route.useLoaderData();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <main className="dashboard-shell">
      <nav className="dashboard-nav">
        <a className="brand" href="/">
          mesh0
        </a>
        <a className="nav-github" href="/">
          Landing
        </a>
      </nav>
      <section className="dashboard-hero">
        <p className="eyebrow">Dashboard</p>
        <h1>{displayName || user.email}</h1>
        <p>
          Mock workspace for agent fleet control. Live runs, sandboxes, events,
          and artifacts will land here.
        </p>
      </section>
      <section className="dashboard-grid">
        <DashboardMetric label="Queued runs" value="128" />
        <DashboardMetric label="Running agents" value="42" />
        <DashboardMetric label="Artifacts" value="1,284" />
        <DashboardMetric label="Backends" value="6" />
      </section>
      <section className="dashboard-panel">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2>Fleet execution preview</h2>
        </div>
        <div className="event-panel">
          <div className="event-row">
            <span>run_mock_01</span>
            <span>sandbox.start</span>
            <strong>running</strong>
          </div>
          <div className="event-row">
            <span>run_mock_02</span>
            <span>artifact.write</span>
            <strong>complete</strong>
          </div>
          <div className="event-row">
            <span>run_mock_03</span>
            <span>agent.queue</span>
            <strong>queued</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
