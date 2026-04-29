import "@fontsource/anonymous-pro/400.css";
import "@fontsource/anonymous-pro/700.css";
import "@fontsource/instrument-serif/400.css";
import Spline from "@splinetool/react-spline";
import {
  IconArrowRight,
  IconBrandGithub,
  IconExternalLink,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import apiIcon from "./assets/abstract-api.svg";
import artifactsIcon from "./assets/abstract-artifacts.svg";
import backendsIcon from "./assets/abstract-backends.svg";
import controlIcon from "./assets/abstract-control.svg";
import eventsIcon from "./assets/abstract-events.svg";
import fleetIcon from "./assets/abstract-fleet.svg";
import "./styles.css";

type ButtonVariant = "primary" | "secondary";

type Action = {
  href: string;
  icon: ReactNode;
  label: string;
  variant: ButtonVariant;
};

type CodeBlock = {
  code: string;
  eyebrow: string;
};

type FeatureSection = {
  actions: Action[];
  body: string;
  code?: CodeBlock;
  eyebrow: string;
  icon: string;
  id: string;
  title: string;
};

const githubUrl = "https://github.com/elliothux/mesh0";
const splineSceneUrl =
  "https://prod.spline.design/CvIhSPrW9tUECpvf/scene.splinecode";

const heroActions: Action[] = [
  {
    href: "#api",
    icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
    label: "Get started",
    variant: "primary",
  },
  {
    href: githubUrl,
    icon: <IconBrandGithub aria-hidden="true" size={18} stroke={1.8} />,
    label: "Star on GitHub",
    variant: "secondary",
  },
];

const apiCode = `const agent = mesh0
  .agent()
  .tools({ github, linear })
  .skills(["code-review", "test-fixer"])
  .sandbox({ provider: "cloudflare" })
  .prompt(({ repo }) => \`Review \${repo.name} and produce a patch.\`);

const job = await mesh0.agents.map(repos, {
  concurrency: 1000,
  retries: 2,
  agent,
});

for await (const event of job.events()) {
  console.log(event.runId, event.type);
}

const artifacts = await job.artifacts();`;

const backendCode = `const job = await mesh0.jobs.create({
  name: "migrate-repos",
  parallelism: 500,
  sandbox: {
    provider: "kubernetes",
    pool: "large",
  },
  agent,
  input: repos,
});`;

const featureSections: FeatureSection[] = [
  {
    actions: [
      {
        href: "#api",
        icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
        label: "Read the docs",
        variant: "secondary",
      },
      {
        href: githubUrl,
        icon: <IconBrandGithub aria-hidden="true" size={18} stroke={1.8} />,
        label: "Star on GitHub",
        variant: "secondary",
      },
    ],
    body: "Define an agent once. Map it over thousands of tasks. Stream every event. Collect every artifact.",
    code: {
      code: apiCode,
      eyebrow: "SDK primitive",
    },
    eyebrow: "API",
    icon: apiIcon,
    id: "api",
    title: "Fleet orchestration as an API.",
  },
  {
    actions: [
      {
        href: "#api",
        icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
        label: "Run your first fleet",
        variant: "primary",
      },
    ],
    body: "Queue runs. Dispatch fleets. Set concurrency. Retry failures. Cancel jobs. Stream logs. Collect outputs.",
    eyebrow: "Fleet Control",
    icon: fleetIcon,
    id: "fleet-control",
    title: "Agents are workloads. Mesh0 gives them a control plane.",
  },
  {
    actions: [
      {
        href: "#events",
        icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
        label: "Explore events",
        variant: "secondary",
      },
    ],
    body: "Track status, events, logs, tool calls, errors, and artifacts from every run in the fleet.",
    eyebrow: "Observability",
    icon: eventsIcon,
    id: "observability",
    title: "Every agent run is visible.",
  },
  {
    actions: [
      {
        href: "#artifacts",
        icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
        label: "View artifact API",
        variant: "secondary",
      },
    ],
    body: "Collect patches, files, directories, JSON, reports, and logs from every agent run.",
    eyebrow: "Artifacts",
    icon: artifactsIcon,
    id: "artifacts",
    title: "Outputs that keep moving.",
  },
  {
    actions: [
      {
        href: "#backends",
        icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
        label: "Build an adapter",
        variant: "primary",
      },
    ],
    body: "Run the same fleet API across Cloudflare, E2B, Daytona, Modal, Kubernetes, Docker, or your own backend adapter.",
    code: {
      code: backendCode,
      eyebrow: "Backend adapter",
    },
    eyebrow: "Sandbox Backends",
    icon: backendsIcon,
    id: "backends",
    title: "Bring your sandbox. Keep the API.",
  },
];

const controlSteps = [
  "Queue runs",
  "Dispatch fleets",
  "Set concurrency",
  "Retry failures",
  "Cancel jobs",
  "Stream logs",
  "Collect outputs",
];

const eventRows = [
  { runId: "run_2FC4", status: "running", type: "tool.call" },
  { runId: "run_31A9", status: "queued", type: "sandbox.start" },
  { runId: "run_887D", status: "retrying", type: "agent.error" },
  { runId: "run_4B20", status: "complete", type: "artifact.write" },
];

const artifactTypes = [
  "patches",
  "files",
  "directories",
  "JSON",
  "reports",
  "logs",
];

const backends = [
  "Cloudflare",
  "E2B",
  "Daytona",
  "Modal",
  "Kubernetes",
  "Docker",
  "Custom adapter",
];

function App() {
  return (
    <main className="site-shell">
      <Hero />
      <FeatureIntro />
      <FeatureSections />
      <OpenSource />
      <FinalCta />
    </main>
  );
}

function Hero() {
  return (
    <header className="hero" id="top">
      <Spline className="spline-scene" scene={splineSceneUrl} />
      <nav aria-label="Main navigation" className="nav">
        <a aria-label="mesh0 home" className="brand" href="#top">
          mesh0
        </a>
        <div className="nav-links">
          <a href="#api">API</a>
          <a href="#fleet-control">Fleet</a>
          <a href="#observability">Events</a>
          <a href="#backends">Backends</a>
        </div>
        <a className="nav-github" href={githubUrl}>
          GitHub
          <IconExternalLink aria-hidden="true" size={15} stroke={1.8} />
        </a>
      </nav>

      <section aria-label="Primary actions" className="hero-actions">
        <div className="hero-slogan">
          <h1>
            <span>Launch 1000 agents in 0.1s.</span>
            <span>One line of code.</span>
          </h1>
          <p>
            Open-source agent infrastructure for developers. Dispatch, observe,
            and manage agent fleets across any sandbox backend.
          </p>
        </div>
        <p className="sr-only">
          Open-source agent infrastructure for developers. Dispatch, observe,
          and manage agent fleets across any sandbox backend.
        </p>
        <Actions actions={heroActions} />
      </section>
    </header>
  );
}

function FeatureIntro() {
  return (
    <section aria-label="Control plane model" className="feature-intro">
      <div>
        <img alt="" className="section-icon intro-icon" src={controlIcon} />
        <p className="eyebrow">Control plane</p>
        <h2>Agent fleets, treated like infrastructure.</h2>
      </div>
      <div className="control-strip">
        {controlSteps.map((step) => (
          <span key={step}>{step}</span>
        ))}
      </div>
    </section>
  );
}

function FeatureSections() {
  return (
    <div className="feature-stack">
      {featureSections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  );
}

function Section({ section }: { section: FeatureSection }) {
  return (
    <section className="feature-section" id={section.id}>
      <div className="section-copy">
        <img alt="" className="section-icon" src={section.icon} />
        <p className="eyebrow">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <p>{section.body}</p>
        <Actions actions={section.actions} />
      </div>
      <SectionVisual section={section} />
    </section>
  );
}

function SectionVisual({ section }: { section: FeatureSection }) {
  if (section.code) {
    return <CodePanel block={section.code} />;
  }

  if (section.id === "fleet-control") {
    return <FleetPanel />;
  }

  if (section.id === "observability") {
    return <EventPanel />;
  }

  return <ArtifactPanel />;
}

function CodePanel({ block }: { block: CodeBlock }) {
  return (
    <div className="code-panel">
      <div className="panel-label">{block.eyebrow}</div>
      <pre>
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function FleetPanel() {
  return (
    <div className="fleet-panel">
      <div className="fleet-lane">
        <span>queued</span>
        <strong>842</strong>
      </div>
      <div className="fleet-lane">
        <span>running</span>
        <strong>1,000</strong>
      </div>
      <div className="fleet-lane">
        <span>retrying</span>
        <strong>18</strong>
      </div>
      <div className="fleet-lane">
        <span>complete</span>
        <strong>9,412</strong>
      </div>
    </div>
  );
}

function EventPanel() {
  return (
    <div className="event-panel" id="events">
      {eventRows.map((event) => (
        <div className="event-row" key={event.runId}>
          <span>{event.runId}</span>
          <span>{event.type}</span>
          <strong>{event.status}</strong>
        </div>
      ))}
    </div>
  );
}

function ArtifactPanel() {
  return (
    <div className="artifact-panel">
      {artifactTypes.map((artifact) => (
        <span key={artifact}>{artifact}</span>
      ))}
    </div>
  );
}

function OpenSource() {
  return (
    <section className="open-source" id="open-source">
      <div>
        <p className="eyebrow">Open Source</p>
        <h2>
          Open-source agent infrastructure. Fork it. Self-host it. Extend it.
        </h2>
      </div>
      <p>
        Mesh0 is built for teams that want control over their agent stack: SDK,
        control plane, adapters, events, and artifacts.
      </p>
      <div className="backend-list" aria-label="Supported sandbox backends">
        {backends.map((backend) => (
          <span key={backend}>{backend}</span>
        ))}
      </div>
      <Actions
        actions={[
          {
            href: githubUrl,
            icon: <IconBrandGithub aria-hidden="true" size={18} stroke={1.8} />,
            label: "Star on GitHub",
            variant: "primary",
          },
          {
            href: "#api",
            icon: <IconArrowRight aria-hidden="true" size={18} stroke={1.8} />,
            label: "Read the architecture",
            variant: "secondary",
          },
        ]}
      />
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta">
      <p className="eyebrow">Start now</p>
      <h2>Start with one line. Scale to one thousand agents.</h2>
      <Actions actions={heroActions} />
    </section>
  );
}

function Actions({ actions }: { actions: Action[] }) {
  return (
    <div className="actions">
      {actions.map((action) => (
        <a
          className={`button button-${action.variant}`}
          href={action.href}
          key={action.label}
        >
          {action.label}
          {action.icon}
        </a>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
