import type { User } from "@mesh0/sdk/types";
import { Avatar, AvatarFallback, AvatarImage } from "@mesh0/ui/avatar";
import { buttonVariants } from "@mesh0/ui/button";
import { openConfirmDialog } from "@mesh0/ui/dialog-portal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mesh0/ui/dropdown-menu";
import {
  IconChevronDown,
  IconExternalLink,
  IconLoader2,
  IconLogout,
  IconUser,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiClient, queryClient } from "../lib/api";

type HeaderVariant = "website" | "dashboard";
type LogoHref = "/" | "#top";

type AnchorNavItem = {
  href: string;
  label: string;
};

type DashboardRouteTo = "/keys" | "/runs";

type RouteNavItem = {
  label: string;
  to: DashboardRouteTo;
};

export type SiteHeaderItem = AnchorNavItem | RouteNavItem;

type SiteHeaderProps = {
  action: ReactNode;
  items: SiteHeaderItem[];
  logoHref: LogoHref;
  variant: HeaderVariant;
};

type WebsiteHeaderActionProps = (
  | {
      href: string;
      to?: undefined;
    }
  | {
      href?: undefined;
      to: "/runs";
    }
) & {
  label: string;
  loading?: boolean;
};

const floatingHeaderClass =
  "absolute top-[max(18px,env(safe-area-inset-top))] left-1/2 z-40 w-[min(calc(100%_-_40px),var(--mesh-max-page))] -translate-x-1/2";

const headerInnerClass =
  "grid min-h-11 grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr]";
const logoClass =
  "inline-flex min-h-11 items-center font-mono text-base font-bold tracking-normal text-[var(--mesh-white)] lowercase";
const desktopNavClass =
  "mx-auto hidden min-h-11 items-center justify-center gap-[22px] text-[0.9rem] text-[var(--mesh-muted)] md:flex";
const mobileNavClass =
  "col-span-full flex w-full gap-4 overflow-x-auto text-[0.9rem] text-[var(--mesh-muted)] md:hidden";
const navItemClass =
  "mesh-nav-item relative inline-flex min-h-11 shrink-0 items-center justify-center px-0 font-mono text-[0.9rem]";

export function SiteHeader({
  action,
  items,
  logoHref,
  variant,
}: SiteHeaderProps) {
  return (
    <header className={floatingHeaderClass}>
      <div className={headerInnerClass}>
        {logoHref === "/" ? (
          <Link aria-label="mesh0 website" className={logoClass} to="/">
            mesh0
          </Link>
        ) : (
          <a aria-label="mesh0 website" className={logoClass} href={logoHref}>
            mesh0
          </a>
        )}
        <HeaderNav items={items} variant="desktop" />
        <div className="ml-auto flex items-center">{action}</div>
        {variant === "dashboard" && (
          <HeaderNav items={items} variant="mobile" />
        )}
      </div>
    </header>
  );
}

export function WebsiteHeaderAction(props: WebsiteHeaderActionProps) {
  const { label, loading = false } = props;
  const content = (
    <>
      {label}
      {loading ? (
        <IconLoader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <IconExternalLink aria-hidden="true" />
      )}
    </>
  );

  return (
    <span className="max-[560px]:hidden">
      {props.to !== undefined ? (
        <Link
          className={buttonVariants()}
          data-slot="button"
          preload="render"
          search={{ page: 1, status: "all" }}
          to={props.to}
        >
          {content}
        </Link>
      ) : (
        <a
          aria-busy={loading}
          aria-disabled={loading}
          className={buttonVariants()}
          data-slot="button"
          href={props.href}
          onClick={
            loading
              ? (event) => {
                  event.preventDefault();
                }
              : undefined
          }
        >
          {content}
        </a>
      )}
    </span>
  );
}

export function AccountHeaderAction({ user }: { user: User }) {
  const displayName = getUserDisplayName(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);

    try {
      await apiClient.user.signOut();
      queryClient.clear();
      window.location.assign("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      setSigningOut(false);
    }
  }

  function confirmSignOut() {
    setMenuOpen(false);
    openConfirmDialog({
      confirmText: "Sign out",
      confirmVariant: "danger",
      description: "End this browser session?",
      onConfirm: signOut,
      title: "Sign out",
      titleClassName: "font-serif text-3xl leading-none font-light",
    });
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={buttonVariants()}
        onClick={() => setMenuOpen(true)}
      >
        <UserAvatar user={user} />
        <span className="min-w-0 truncate">{displayName}</span>
        <IconChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-72 border border-[var(--mesh-line)] bg-[var(--mesh-panel-raised)] p-2 text-[var(--mesh-white)]"
      >
        <div className="grid gap-1 px-2 py-2 font-mono">
          <span className="truncate text-sm font-bold text-[var(--mesh-white)]">
            {displayName}
          </span>
          <span className="truncate text-xs font-normal text-[var(--mesh-muted)]">
            {user.email}
          </span>
        </div>
        <DropdownMenuSeparator className="bg-[var(--mesh-line)]" />
        <DropdownMenuItem
          className="cursor-pointer px-2 py-2 text-[var(--mesh-white)]"
          disabled={signingOut}
          onClick={confirmSignOut}
        >
          {signingOut ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <IconLogout aria-hidden="true" />
          )}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderNav({
  items,
  variant,
}: {
  items: SiteHeaderItem[];
  variant: "desktop" | "mobile";
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <nav
      aria-label={variant === "desktop" ? "Primary" : "Primary mobile"}
      className={variant === "desktop" ? desktopNavClass : mobileNavClass}
    >
      {items.map((item) => {
        if ("to" in item) {
          return (
            <DashboardNavLink
              className={navItemClass}
              data-active={pathname === item.to}
              key={item.to}
              label={item.label}
              to={item.to}
            />
          );
        }

        return (
          <a className={navItemClass} href={item.href} key={item.href}>
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

function DashboardNavLink({
  className,
  "data-active": dataActive,
  label,
  to,
}: {
  className: string;
  "data-active": boolean;
  label: string;
  to: DashboardRouteTo;
}) {
  if (to === "/runs") {
    return (
      <Link
        className={className}
        data-active={dataActive}
        preload="render"
        search={{ page: 1, status: "all" }}
        to={to}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      className={className}
      data-active={dataActive}
      preload="render"
      search={{ page: 1 }}
      to={to}
    >
      {label}
    </Link>
  );
}

function UserAvatar({ user }: { user: User }) {
  return (
    <Avatar size="sm">
      {user.profilePictureUrl !== null && (
        <AvatarImage alt="" src={user.profilePictureUrl} />
      )}
      <AvatarFallback>
        {getUserInitial(user) ?? <IconUser aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}

function getUserDisplayName(user: User) {
  const name = getUserName(user);

  return name.length > 0 ? name : user.email;
}

function getUserInitial(user: User) {
  const source = getUserDisplayName(user);
  const initial = source.trim().charAt(0).toUpperCase();

  return initial.length > 0 ? initial : null;
}

function getUserName(user: User) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
