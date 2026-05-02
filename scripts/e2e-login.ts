import type { RpcClient } from "@mesh0/api";
import { AUTH_ACCESS_TOKEN_COOKIE } from "@mesh0/sdk/auth";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const LOG_DIR = ".log";
const FAILURE_SCREENSHOT = join(LOG_DIR, "e2e-login-failure.png");
const RESULT_JSON = join(LOG_DIR, "e2e-login.json");
const DEFAULT_WEB_URL = "http://localhost:5591";
const DEFAULT_API_URL = "http://localhost:5592";

type ProbeResult = {
  apiMe?: string;
  authCookiePresent: boolean;
  dashboardUrl: string;
  finalUrl: string;
  homeShowsDashboard: boolean;
  homeShowsSignIn: boolean;
  responses: string[];
  webUrl: string;
};

await main();

async function main() {
  await mkdir(LOG_DIR, { recursive: true });

  const env = await readLocalEnv();
  const email = requiredEnv(env, "E2E_USER_EMAIL");
  const password = requiredEnv(env, "E2E_USER_PASSWORD");
  const webUrl = env.E2E_WEB_URL ?? DEFAULT_WEB_URL;
  const headless = parseBooleanEnv(env.E2E_HEADLESS ?? "false");
  const apiUrl =
    env.E2E_API_URL ??
    (await readEnvFile("apps/web/.env")).VITE_MESH0_API_URL ??
    DEFAULT_API_URL;
  const responses: string[] = [];

  await waitForReachable(webUrl, "web");
  await waitForReachable(apiUrl, "api");

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { height: 900, width: 1280 },
  });
  const page = await context.newPage();
  let result: ProbeResult | undefined;
  capturePageDiagnostics(page, responses);

  try {
    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    await clickFirst(page, "sign in", [
      () => page.getByRole("link", { name: /sign in/i }),
      () => page.getByRole("button", { name: /sign in/i }),
      () => page.locator('a[href*="/auth/login"]').first(),
    ]);

    await fillFirst(page, "email", email, [
      'input[type="email"]',
      'input[name="email"]',
      'input[autocomplete="email"]',
      'input[placeholder*="email" i]',
    ]);
    await clickFirst(page, "continue", [
      () => page.getByRole("button", { name: /continue/i }),
      () => page.getByRole("button", { name: /sign in/i }),
      () => page.locator('button[type="submit"]').first(),
    ]);

    await fillFirst(page, "password", password, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
    ]);
    await clickFirst(page, "submit", [
      () => page.getByRole("button", { name: /sign in/i }),
      () => page.getByRole("button", { name: /log in/i }),
      () => page.getByRole("button", { name: /continue/i }),
      () => page.locator('button[type="submit"]').first(),
    ]);

    await waitForLoginReturn(page, webUrl, {
      failOnHumanCheck: headless,
    });
    await page.waitForLoadState("domcontentloaded");

    const finalUrl = page.url();
    const dashboardUrl = new URL("/dashboard", webUrl).toString();
    const cookies = await context.cookies(webUrl);
    const authCookiePresent = cookies.some(
      (cookie) => cookie.name === AUTH_ACCESS_TOKEN_COOKIE,
    );

    const apiMe = await probeMe(apiUrl, cookies);

    await page.goto(new URL("/", webUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    const homeShowsDashboard =
      (await page.getByRole("link", { name: /dashboard/i }).count()) > 0;
    const homeShowsSignIn =
      (await page.getByRole("link", { name: /sign in/i }).count()) > 0 ||
      (await page.getByRole("button", { name: /sign in/i }).count()) > 0;

    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const dashboardResultUrl = page.url();

    result = {
      apiMe,
      authCookiePresent,
      dashboardUrl: dashboardResultUrl,
      finalUrl,
      homeShowsDashboard,
      homeShowsSignIn,
      responses,
      webUrl,
    };
    await writeFile(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`);

    if (!authCookiePresent) {
      throw new Error("login finished without mesh0 access token cookie");
    }

    if (!homeShowsDashboard || homeShowsSignIn) {
      throw new Error("home page still renders signed-out state");
    }

    if (new URL(dashboardResultUrl).pathname !== "/dashboard") {
      throw new Error(`dashboard redirected to ${dashboardResultUrl}`);
    }

    console.log(`login-e2e-ok ${finalUrl}`);
  } catch (error) {
    if (result === undefined) {
      await writeFailureResult(page, responses, webUrl);
    }
    if (!page.isClosed()) {
      await page.screenshot({ fullPage: true, path: FAILURE_SCREENSHOT });
    }
    throw error;
  } finally {
    await browser.close();
  }
}

async function launchBrowser(headless: boolean): Promise<Browser> {
  const channel = Bun.env.E2E_BROWSER_CHANNEL;
  if (channel !== undefined && channel.length > 0) {
    return chromium.launch({ channel, headless });
  }

  try {
    return await chromium.launch({ headless });
  } catch {
    return chromium.launch({ channel: "chrome", headless });
  }
}

function capturePageDiagnostics(page: Page, responses: string[]) {
  page.on("response", (response) => {
    const url = response.url();
    if (
      url.includes("/auth/") ||
      url.includes("/rpc/user/me") ||
      url.includes("workos")
    ) {
      responses.push(`${response.status()} ${sanitizeDiagnosticUrl(url)}`);
    }
  });
  page.on("pageerror", (error) => {
    responses.push(`pageerror ${error.message}`);
  });
}

async function probeMe(
  apiUrl: string,
  cookies: { name: string; value: string }[],
) {
  const cookieHeader = cookies
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  const link = new RPCLink({
    fetch: (request, init) =>
      fetch(request, {
        ...init,
        headers: {
          ...headersToRecord(init?.headers),
          Cookie: cookieHeader,
        },
      }),
    url: `${apiUrl.replace(/\/$/, "")}/rpc`,
  });
  const rpc: RpcClient = createORPCClient(link);

  try {
    await rpc.user.me();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function waitForLoginReturn(
  page: Page,
  webUrl: string,
  { failOnHumanCheck }: { failOnHumanCheck: boolean },
) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (page.url().startsWith(webUrl)) {
      return;
    }

    if (failOnHumanCheck && (await hasHumanCheck(page))) {
      throw new Error("WorkOS human verification is blocking automated login");
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`login did not return to ${webUrl}`);
}

async function hasHumanCheck(page: Page) {
  const iframeCount = await page
    .locator(
      [
        'iframe[src*="challenge"]',
        'iframe[src*="cloudflare"]',
        'iframe[src*="turnstile"]',
        'iframe[title*="Cloudflare" i]',
        'iframe[title*="Widget" i]',
      ].join(","),
    )
    .count()
    .catch(() => 0);

  return (
    iframeCount > 0 ||
    page
      .frames()
      .some((frame) => /challenge|cloudflare|turnstile/i.test(frame.url()))
  );
}

function headersToRecord(headers: HeadersInit | undefined) {
  if (headers === undefined) {
    return {};
  }

  return Object.fromEntries(new Headers(headers));
}

async function clickFirst(
  page: Page,
  label: string,
  locators: Array<() => ReturnType<Page["locator"]>>,
) {
  for (const locatorFactory of locators) {
    const locator = locatorFactory();
    try {
      await locator.waitFor({ state: "visible", timeout: 7_500 });
      await locator.click();
      return;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find ${label} control`);
}

async function fillFirst(
  page: Page,
  label: string,
  value: string,
  selectors: string[],
) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 15_000 });
      await locator.fill(value);
      return;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find ${label} input`);
}

async function waitForReachable(url: string, label: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`${label} is not reachable at ${url}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeDiagnosticUrl(value: string) {
  const url = new URL(value);
  for (const key of url.searchParams.keys()) {
    if (/code|state|token|password|secret|session/i.test(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }

  return url.toString();
}

function parseBooleanEnv(value: string) {
  return !["0", "false", "no"].includes(value.toLowerCase());
}

async function writeFailureResult(
  page: Page,
  responses: string[],
  webUrl: string,
) {
  const result = {
    currentUrl: page.isClosed()
      ? "[page closed]"
      : sanitizeDiagnosticUrl(page.url()),
    responses,
    webUrl,
  };
  await writeFile(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`);
}

async function readLocalEnv() {
  return {
    ...(await readEnvFile(".env")),
    ...Bun.env,
  };
}

async function readEnvFile(path: string) {
  const env: Record<string, string> = {};
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    return env;
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).replace(/^["']|["']$/g, "");
    env[key] = value;
  }

  return env;
}

function requiredEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
}
