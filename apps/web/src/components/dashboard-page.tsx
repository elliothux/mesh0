import { Alert, AlertDescription, AlertTitle } from "@mesh0/ui/alert";
import { IconAlertCircle, IconDatabaseOff } from "@tabler/icons-react";
import type { ReactNode } from "react";

type DashboardPageProps = {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
};

type DashboardStateProps = {
  description?: string;
  title: string;
  variant?: "empty" | "error" | "loading";
};

const pageClass =
  "mx-auto grid w-[min(calc(100%_-_40px),var(--mesh-max-page))] gap-8 pt-[clamp(112px,12vw,148px)] pb-[clamp(56px,8vw,104px)]";
const headerClass =
  "grid gap-6 border-b border-[var(--mesh-line)] pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end";
const titleBlockClass = "grid w-full gap-3";
const titleClass =
  "font-serif text-[clamp(1.75rem,3.5vw,3rem)] leading-[0.95] font-light tracking-normal text-[var(--mesh-white)]";
const descriptionClass =
  "w-full max-w-3xl text-[clamp(0.95rem,1vw+0.78rem,1.2rem)] leading-[1.45] text-[var(--mesh-muted)]";

export function DashboardPage({
  action,
  children,
  description,
  title,
}: DashboardPageProps) {
  return (
    <section className={pageClass}>
      <header className={headerClass}>
        <div className={titleBlockClass}>
          <h1 className={titleClass}>{title}</h1>
          <p className={descriptionClass}>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function DashboardState({
  description,
  title,
  variant = "empty",
}: DashboardStateProps) {
  if (variant === "error") {
    return (
      <Alert className="border-[var(--mesh-line)] bg-black/20">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        {description !== undefined && (
          <AlertDescription>{description}</AlertDescription>
        )}
      </Alert>
    );
  }

  return (
    <div className="grid min-h-40 place-items-center border border-dashed border-[var(--mesh-line-strong)] bg-black/20 p-6 text-center">
      <div className="grid justify-items-center gap-2 text-[var(--mesh-muted)]">
        <IconDatabaseOff aria-hidden="true" className="size-5" />
        <h2 className="text-sm font-bold text-[var(--mesh-white)]">{title}</h2>
        {description !== undefined && <p className="text-sm">{description}</p>}
      </div>
    </div>
  );
}
