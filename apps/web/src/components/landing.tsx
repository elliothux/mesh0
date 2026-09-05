import { buttonVariants } from "@mesh0/ui/button";
import { cn } from "@mesh0/ui/lib/utils";
import Spline from "@splinetool/react-spline";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import type { ReactNode } from "react";
import apiIcon from "../assets/abstract-api.svg";
import artifactsIcon from "../assets/abstract-artifacts.svg";
import backendsIcon from "../assets/abstract-backends.svg";
import controlIcon from "../assets/abstract-control.svg";
import eventsIcon from "../assets/abstract-events.svg";
import fleetIcon from "../assets/abstract-fleet.svg";
import { SiteHeader } from "./site-header";
import { WebsiteDashboardAction } from "./website-dashboard-action";

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

type LandingProps = {
  apiStatusCount: number;
};

const githubUrl = "https://github.com/elliothux/mesh0";
const splineSceneUrl =
  "https://prod.spline.design/CvIhSPrW9tUECpvf/scene.splinecode";

const websiteNavItems = [
  { href: "#api", label: "API" },
  { href: "#fleet-control", label: "Fleet" },
  { href: "#observability", label: "Events" },
  { href: "#backends", label: "Backends" },
  { href: "/docs", label: "Docs" },
];

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
        href: "/docs",
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

const meshShellClass =
  "min-h-svh overflow-hidden bg-[var(--mesh-black)] font-mono text-[var(--mesh-white)] [background:linear-gradient(var(--mesh-line),var(--mesh-line))_var(--mesh-page-gutter)_0/1px_100%_no-repeat,linear-gradient(var(--mesh-line),var(--mesh-line))_calc(100%_-_var(--mesh-page-gutter)_-_1px)_0/1px_100%_no-repeat,var(--mesh-black)]";
const heroClass =
  "relative isolate h-svh min-h-[680px] overflow-hidden border-b border-[var(--mesh-line)] bg-[var(--mesh-black)] max-[560px]:min-h-[640px]";
const heroOverlayClass =
  "pointer-events-none absolute inset-0 z-10 [background:linear-gradient(180deg,oklch(0%_0_0_/_0.42),transparent_22%),linear-gradient(0deg,oklch(0%_0_0_/_0.48),transparent_32%)]";
const heroActionsClass =
  "absolute top-1/2 left-1/2 z-20 grid w-[min(calc(100%_-_40px),var(--mesh-max-page))] -translate-x-1/2 -translate-y-[37%] justify-items-center text-center max-[560px]:w-[min(calc(100%_-_40px),420px)] max-[560px]:-translate-y-[35%]";
const heroTitleClass =
  "m-0 w-[min(100%,1120px)] text-balance font-serif text-[clamp(3.4rem,5.5vw,5.8rem)] leading-[0.98] font-normal tracking-normal text-[var(--mesh-white)] max-[560px]:w-[min(100%,320px)] max-[560px]:text-[clamp(2.4rem,9.3vw,3rem)] max-[560px]:leading-none";
const heroCopyClass =
  "mt-[26px] max-w-[58ch] text-balance text-[clamp(1rem,0.8vw+0.82rem,1.38rem)] leading-[1.32] text-[var(--mesh-muted)] max-[560px]:mt-[22px] max-[560px]:max-w-[28ch] max-[560px]:text-base max-[560px]:leading-[1.35]";
const frameSectionClass =
  "relative mx-auto w-[min(calc(100%_-_40px),var(--mesh-max-page))] after:pointer-events-none after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-screen after:-translate-x-1/2 after:bg-[var(--mesh-line)]";
const featureIntroClass = cn(
  frameSectionClass,
  "grid gap-7 px-[var(--mesh-section-x)] py-[clamp(60px,8vw,104px)] md:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] md:items-end",
);
const featureSectionClass = cn(
  frameSectionClass,
  "grid gap-[clamp(28px,5vw,72px)] px-[var(--mesh-section-x)] py-[clamp(68px,9vw,112px)] lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1fr)] lg:items-center",
);
const openSourceClass = cn(
  frameSectionClass,
  "grid gap-7 px-[var(--mesh-section-x)] py-[clamp(72px,10vw,128px)]",
);
const finalCtaClass = cn(
  frameSectionClass,
  "grid px-[var(--mesh-section-x)] pt-[clamp(72px,10vw,132px)] pb-[max(80px,env(safe-area-inset-bottom))]",
);
const eyebrowClass =
  "m-0 mb-4 text-[0.82rem] font-bold text-[var(--mesh-muted)]";
const sectionTitleClass =
  "m-0 text-balance font-serif text-[clamp(2.25rem,3.8vw,4.25rem)] leading-none font-light tracking-normal text-[oklch(88%_0_0)]";
const introTitleClass = cn(
  sectionTitleClass,
  "max-w-[15ch] text-[clamp(2.45rem,4.8vw,4.9rem)] leading-[0.98]",
);
const ctaTitleClass =
  "m-0 max-w-[820px] text-balance font-serif text-[clamp(2.35rem,4.6vw,5rem)] leading-[0.98] font-light tracking-normal text-[oklch(88%_0_0)]";
const sectionCopyClass =
  "mt-6 max-w-[62ch] text-[clamp(1rem,0.45vw+0.95rem,1.16rem)] leading-[1.7] text-[var(--mesh-muted)]";
const iconClass =
  "mb-[clamp(20px,3vw,36px)] block size-[clamp(56px,5vw,86px)] object-contain";
const panelClass =
  "border border-[var(--mesh-line)] [background:linear-gradient(90deg,var(--mesh-line)_1px,transparent_1px),linear-gradient(0deg,var(--mesh-line)_1px,transparent_1px),var(--mesh-panel)] [background-size:72px_72px]";
const tileClass =
  "inline-flex min-h-11 items-center border-r border-b border-[var(--mesh-line)] bg-white/[0.015] px-3.5 text-[0.88rem] text-[var(--mesh-muted)]";
export function Landing({ apiStatusCount }: LandingProps) {
  return (
    <main className={meshShellClass}>
      <Hero />
      <FeatureIntro apiStatusCount={apiStatusCount} />
      <FeatureSections />
      <OpenSource />
      <FinalCta />
    </main>
  );
}

function Hero() {
  return (
    <header className={heroClass} id="top">
      <Spline
        className="absolute inset-0 z-0 h-full w-full"
        scene={splineSceneUrl}
      />
      <div className={heroOverlayClass} />
      <SiteHeader
        action={<WebsiteDashboardAction />}
        items={websiteNavItems}
        logoHref="#top"
        variant="website"
      />

      <section aria-label="Primary actions" className={heroActionsClass}>
        <div className="grid w-[min(100%,980px)] justify-items-center text-center">
          <h1 className={heroTitleClass}>
            <span className="block md:whitespace-nowrap">
              Launch 1000 agents in 0.1s.
            </span>
            <span className="block md:whitespace-nowrap">
              One line of code.
            </span>
          </h1>
          <p className={heroCopyClass}>
            Open-source agent infrastructure for developers. Dispatch, observe,
            and manage agent fleets across any sandbox backend.
          </p>
        </div>
        <Actions
          actions={heroActions}
          className="mt-[clamp(32px,7vh,84px)] justify-center max-[560px]:grid max-[560px]:w-full max-[560px]:grid-cols-1"
        />
      </section>
    </header>
  );
}

function FeatureIntro({ apiStatusCount }: { apiStatusCount: number }) {
  return (
    <section aria-label="Control plane model" className={featureIntroClass}>
      <div>
        <img
          alt=""
          className={cn(iconClass, "mb-[clamp(24px,3vw,40px)]")}
          src={controlIcon}
        />
        <p className={eyebrowClass}>Control plane</p>
        <h2 className={introTitleClass}>
          Agent fleets, treated like infrastructure.
        </h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border-t border-l border-[var(--mesh-line)]">
        <span className={tileClass}>{apiStatusCount} status rows</span>
        {controlSteps.map((step) => (
          <span className={tileClass} key={step}>
            {step}
          </span>
        ))}
      </div>
    </section>
  );
}

function FeatureSections() {
  return (
    <>
      {featureSections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </>
  );
}

function Section({ section }: { section: FeatureSection }) {
  return (
    <section className={featureSectionClass} id={section.id}>
      <div className="max-w-[620px]">
        <img alt="" className={iconClass} src={section.icon} />
        <p className={eyebrowClass}>{section.eyebrow}</p>
        <h2 className={sectionTitleClass}>{section.title}</h2>
        <p className={sectionCopyClass}>{section.body}</p>
        <Actions actions={section.actions} className="mt-7" />
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
    <div className={cn(panelClass, "min-w-0 overflow-hidden")}>
      <div className="border-b border-[var(--mesh-line)] bg-[var(--mesh-black-soft)] px-4 py-3 text-[0.82rem] font-bold text-[var(--mesh-muted)]">
        {block.eyebrow}
      </div>
      <pre className="m-0 max-h-[560px] overflow-auto p-[18px] text-[clamp(0.78rem,0.35vw+0.7rem,0.94rem)] leading-[1.72] whitespace-pre text-[var(--mesh-white)]">
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function FleetPanel() {
  return (
    <div
      className={cn(
        panelClass,
        "grid grid-cols-1 gap-px overflow-hidden bg-[var(--mesh-line)] sm:grid-cols-2",
      )}
    >
      {[
        { label: "queued", value: "842" },
        { label: "running", value: "1,000" },
        { label: "retrying", value: "18" },
        { label: "complete", value: "9,412" },
      ].map((lane) => (
        <div
          className="grid min-h-[154px] content-between bg-[var(--mesh-panel)] p-[18px]"
          key={lane.label}
        >
          <span className="text-[0.9rem] text-[var(--mesh-muted)]">
            {lane.label}
          </span>
          <strong className="text-[clamp(2.6rem,5vw,5.4rem)] leading-[0.9] font-normal tracking-normal text-[var(--mesh-white)] tabular-nums">
            {lane.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

function EventPanel() {
  return (
    <div className={panelClass} id="events">
      {eventRows.map((event) => (
        <div
          className="grid min-h-14 grid-cols-1 items-center gap-1.5 border-b border-[var(--mesh-line)] px-3.5 py-3 text-[0.82rem] text-[var(--mesh-muted)] last:border-b-0 sm:grid-cols-[1fr_1fr_auto] sm:gap-3 sm:py-0"
          key={event.runId}
        >
          <span>{event.runId}</span>
          <span>{event.type}</span>
          <strong className="text-[0.78rem] font-bold text-[var(--mesh-white)]">
            {event.status}
          </strong>
        </div>
      ))}
    </div>
  );
}

function ArtifactPanel() {
  return (
    <div
      className={cn(
        panelClass,
        "grid min-h-80 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] content-center",
      )}
    >
      {artifactTypes.map((artifact) => (
        <span
          className={cn(tileClass, "min-h-20 justify-center")}
          key={artifact}
        >
          {artifact}
        </span>
      ))}
    </div>
  );
}

function OpenSource() {
  return (
    <section className={openSourceClass} id="open-source">
      <div>
        <p className={eyebrowClass}>Open Source</p>
        <h2 className={ctaTitleClass}>
          Open-source agent infrastructure. Fork it. Self-host it. Extend it.
        </h2>
      </div>
      <p className="m-0 max-w-[68ch] text-[1.1rem] leading-[1.7] text-[var(--mesh-muted)]">
        Mesh0 is built for teams that want control over their agent stack: SDK,
        control plane, adapters, events, and artifacts.
      </p>
      <div
        aria-label="Supported sandbox backends"
        className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-t border-l border-[var(--mesh-line)]"
      >
        {backends.map((backend) => (
          <span className={tileClass} key={backend}>
            {backend}
          </span>
        ))}
      </div>
      <Actions actions={heroActions} className="mt-0" />
    </section>
  );
}

function FinalCta() {
  return (
    <section className={finalCtaClass}>
      <p className={eyebrowClass}>Start now</p>
      <h2 className={ctaTitleClass}>
        Start with one line. Scale to one thousand agents.
      </h2>
      <Actions actions={heroActions} className="mt-7" />
    </section>
  );
}

function Actions({
  actions,
  className,
}: {
  actions: Action[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-0", className)}>
      {actions.map((action) => (
        <a
          className={buttonVariants({
            variant: action.variant === "primary" ? "white" : "default",
          })}
          data-slot="button"
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
