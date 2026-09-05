import { API_KEY_PREFIX, AUTH_ACCESS_TOKEN_COOKIE } from "@mesh0/sdk/auth";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { startLocalDashboardApi } from "../test/support/local-api";

await main();

async function main() {
  const dashboardApi = await startLocalDashboardApi();
  const webPort = await findFreePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  const webServer = startWebServer({
    apiUrl: dashboardApi.apiUrl,
    port: webPort,
  });
  let browser: Browser | undefined;

  try {
    await waitForReachable(webUrl, "web");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { height: 920, width: 1360 },
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: webUrl,
    });
    await context.addCookies([
      {
        httpOnly: true,
        name: AUTH_ACCESS_TOKEN_COOKIE,
        sameSite: "Lax",
        secure: false,
        url: webUrl,
        value: dashboardApi.accessToken,
      },
    ]);
    const page = await context.newPage();

    await testRunsPage(page, webUrl, dashboardApi.seed.completedRunId);
    await testRunDetailPage(page, webUrl, {
      artifactPath: dashboardApi.seed.artifactPath,
      completedRunId: dashboardApi.seed.completedRunId,
      eventType: dashboardApi.seed.eventType,
      runningRunId: dashboardApi.seed.runningRunId,
    });
    await testControlPlanePages(page, webUrl, {
      agentName: dashboardApi.seed.agentName,
      cronName: dashboardApi.seed.cronName,
      webhookName: dashboardApi.seed.webhookName,
    });
    await testDocsPage(page, webUrl);
    await testApiKeysPage(page, webUrl);
    await testAccountMenu(page, webUrl, dashboardApi.seed.userEmail);

    console.log("dashboard-e2e-ok");
  } catch (error) {
    console.error(webServer.logs.join("\n"));
    throw error;
  } finally {
    if (browser !== undefined) {
      await browser.close();
    }
    webServer.stop();
    dashboardApi.close();
  }
}

async function testControlPlanePages(
  page: Page,
  webUrl: string,
  seed: { agentName: string; cronName: string; webhookName: string },
) {
  await page.goto(new URL("/agents", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { exact: true, name: "Agents" }).waitFor();
  await page.getByText(seed.agentName).first().waitFor();
  await page.getByRole("button", { name: "Run" }).first().click();
  await page.getByText(/Run queued: run_/).waitFor();

  await page.goto(new URL("/crons", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { exact: true, name: "Crons" }).waitFor();
  await page.getByText(seed.cronName).first().waitFor();

  await page.goto(new URL("/webhooks", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { exact: true, name: "Webhooks" }).waitFor();
  await page.getByText(seed.webhookName).first().waitFor();
  await page.getByRole("button", { name: "Copy webhook URL" }).first().click();
  const copiedWebhookUrl = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedWebhookUrl.includes("/webhook/"), "webhook URL copy failed");

  await page.goto(new URL("/playground", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { exact: true, name: "Playground" })
    .waitFor();
  await page.waitForTimeout(1_500);
  await page.getByLabel("Agent name").fill(seed.agentName);
  await page.getByLabel("Prompt").fill("Playground e2e run.");
  await page.getByRole("button", { name: "Run" }).click();
  await page.getByRole("button", { name: "Copy run ID" }).waitFor();
}

async function testDocsPage(page: Page, webUrl: string) {
  await page.goto(new URL("/docs", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Quick Start" }).waitFor();
  await page.getByText("mesh0 docs").waitFor();
  const pythonTab = page.getByRole("tab", { name: "Python" });
  await pythonTab.click();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const selectedTab = document.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    return selectedTab?.textContent?.includes("Python") === true;
  });
  await page.getByText("HTTP API").waitFor();
  await page.getByLabel("Search docs").fill("live");
  await page.getByRole("button", { name: /Live logs/ }).click();
  await page.getByRole("heading", { name: "Runs and Events" }).waitFor();
  await page.getByText("/rpc/runs/liveEvents").first().waitFor();
}

async function testRunsPage(
  page: Page,
  webUrl: string,
  completedRunId: string,
) {
  await page.goto(new URL("/runs", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Agent runs" }).waitFor();
  assertDefaultSearch(page.url(), {
    page: "1",
    status: "all",
  });
  assert(
    (await page
      .getByRole("navigation", { name: "Primary" })
      .getByText("Account")
      .count()) === 0,
    "dashboard nav still includes Account",
  );
  await page.getByText(completedRunId).first().waitFor();
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Runs refreshed").waitFor();
  await page.getByText("32 runs loaded").waitFor();
  await page.getByRole("button", { name: "Next page" }).click();
  await page.waitForURL((url) => url.searchParams.get("page") === "2");
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.waitForURL((url) => url.searchParams.get("page") === "1");

  await page.getByRole("button", { name: "Completed" }).click();
  await page.getByText(completedRunId).first().waitFor();
  const completedRunRow = page
    .locator("tbody tr")
    .filter({ hasText: completedRunId })
    .first();
  await completedRunRow.getByRole("button", { name: "Copy run ID" }).click();
  const copiedTableRunId = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedTableRunId === completedRunId, "run table copy failed");
  assert(
    new URL(page.url()).searchParams.get("runId") === null,
    "copying a run row value changed the runs URL",
  );

  await page.goto(new URL("/runs?page=1&status=missing", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(
    (url) =>
      url.pathname === "/runs" &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("status") === "all",
  );
}

async function testRunDetailPage(
  page: Page,
  webUrl: string,
  seed: {
    artifactPath: string;
    completedRunId: string;
    eventType: string;
    runningRunId: string;
  },
) {
  await page.goto(new URL(`/run/${seed.completedRunId}`, webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: seed.completedRunId }).waitFor();
  await page.getByRole("link", { name: "Info" }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Run ID" })
    .filter({ hasText: seed.completedRunId })
    .waitFor();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Status" })
    .filter({ hasText: "completed" })
    .waitFor();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Artifacts" })
    .filter({ hasText: "1" })
    .waitFor();
  await page.getByText("Completed dashboard run with artifact").waitFor();
  await page.getByText("dashboard completed ok").waitFor();
  await page.getByRole("button", { name: "Copy Status" }).click();
  const copiedRunStatus = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedRunStatus === "completed", "run detail status copy failed");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  const copiedRunPrompt = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(
    copiedRunPrompt === "Completed dashboard run with artifact",
    "run prompt copy failed",
  );
  await page.getByRole("button", { name: "Copy last message" }).click();
  const copiedRunLastMessage = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(
    copiedRunLastMessage === "dashboard completed ok",
    "run last message copy failed",
  );

  await page.getByRole("link", { name: "Artifacts" }).click();
  await page.waitForURL((url) =>
    url.pathname.endsWith(`/${seed.completedRunId}/artifacts`),
  );
  const artifactUrl = new URL(page.url());
  artifactUrl.searchParams.set("path", seed.artifactPath);
  await page.goto(artifactUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("path") === seed.artifactPath,
  );
  await page.getByRole("heading", { name: seed.artifactPath }).waitFor();
  await page.getByText("dashboard artifact ok").waitFor();

  const downloadHref = await page
    .getByRole("link", { name: "Download" })
    .getAttribute("href");
  assert(downloadHref !== null, "artifact download link missing href");
  const response = await page.request.get(downloadHref);
  assert(response.ok(), `artifact download failed: ${response.status()}`);
  assert(
    (await response.text()).includes("dashboard artifact ok"),
    "artifact download returned unexpected content",
  );

  await page.getByRole("link", { name: "Observability" }).click();
  await page.waitForURL((nextUrl) =>
    nextUrl.pathname.endsWith(`/${seed.completedRunId}/observability`),
  );
  await page.getByText("3 events").waitFor();
  await page.getByText("thread.started").first().waitFor();
  await page.getByText("turn.completed").first().waitFor();
  const url = new URL(`/run/${seed.completedRunId}/observability`, webUrl);
  url.searchParams.set("eventType", "all");
  url.searchParams.set("page", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: seed.completedRunId }).waitFor();
  assertDefaultSearch(page.url(), {
    eventType: "all",
    page: "1",
  });
  await page.getByLabel("Filter by event type").click();
  await page
    .locator('[data-slot="select-item"]')
    .filter({ hasText: seed.eventType })
    .click();
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("eventType") === seed.eventType,
  );
  const eventRow = page
    .locator("tbody tr")
    .filter({ hasText: seed.eventType })
    .first();
  await eventRow.click();
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("eventId") !== null,
  );
  await page.getByText("msg_dashboard_completed").first().waitFor();
  await page.getByRole("button", { name: "Copy Run ID" }).last().click();
  const copiedEventRunId = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedEventRunId === seed.completedRunId, "event detail copy failed");
  await page.getByRole("button", { name: "Copy event payload" }).click();
  const copiedEventPayload = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(
    copiedEventPayload.includes("msg_dashboard_completed"),
    "event payload copy failed",
  );

  await page.goto(
    new URL(
      `/run/${seed.completedRunId}/observability?eventType=nope&page=1`,
      webUrl,
    ).toString(),
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForURL(
    (nextUrl) =>
      nextUrl.pathname === `/run/${seed.completedRunId}/observability` &&
      nextUrl.searchParams.get("eventType") === "all" &&
      nextUrl.searchParams.get("page") === "1",
  );

  await page.goto(
    new URL(`/run/${seed.runningRunId}/observability`, webUrl).toString(),
    { waitUntil: "domcontentloaded" },
  );
  await page.getByRole("heading", { name: seed.runningRunId }).waitFor();
  await page.getByRole("button", { name: "Live" }).click();
  await page.getByRole("heading", { name: "Live log" }).waitFor();
  await page.getByText("thread.started").first().waitFor();
}

async function testApiKeysPage(page: Page, webUrl: string) {
  const keyName = "E2E dashboard key";
  const renamedKeyName = "Renamed E2E dashboard key";
  await page.goto(new URL("/keys", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "API keys" }).waitFor();
  assertDefaultSearch(page.url(), { page: "1" });
  await page.getByText("Dashboard active key").first().waitFor();
  await page.getByText("Dashboard revoked key").first().waitFor();
  await page.getByRole("columnheader", { name: "API Key" }).waitFor();
  await page.getByRole("button", { name: "Create key" }).click();
  const createKeyDialog = page.getByRole("dialog");
  await createKeyDialog.getByLabel("Name").fill(keyName);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create key" })
    .click();

  const keyInput = page.getByLabel("New key");
  await keyInput.waitFor();
  const createdKey = await keyInput.inputValue();
  assert(
    createdKey.startsWith(API_KEY_PREFIX),
    "created API key format is invalid",
  );
  await page.getByText("API key created").waitFor();
  await page.getByRole("button", { name: "Copy API key" }).click();
  const copiedApiKey = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedApiKey === createdKey, "api key copy failed");
  await page.keyboard.press("Escape");

  await page.getByText(keyName).first().waitFor();
  const apiKeyRow = page.locator("tbody tr").filter({ hasText: keyName });
  await apiKeyRow.first().click();
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("keyId") !== null,
  );
  const keyDialog = page.getByRole("dialog");
  const activeElementLabel = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label"),
  );
  assert(
    activeElementLabel !== "API key name",
    "key detail name input was auto focused",
  );
  await keyDialog.getByLabel("API key name").fill(renamedKeyName);
  await keyDialog.getByRole("button", { name: "Rename key" }).click();
  await page.getByText("API key renamed").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("keyId") === null,
  );
  const renamedApiKeyRow = page
    .locator("tbody tr")
    .filter({ hasText: renamedKeyName })
    .first();
  await renamedApiKeyRow.waitFor();
  await renamedApiKeyRow.click();
  await page.waitForURL(
    (nextUrl) => nextUrl.searchParams.get("keyId") !== null,
  );
  const renamedKeyDialog = page.getByRole("dialog");
  await renamedKeyDialog.getByRole("button", { name: "Copy Name" }).click();
  const copiedRenamedKeyName = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert(copiedRenamedKeyName === renamedKeyName, "API key detail copy failed");
  await renamedKeyDialog
    .getByRole("button", { exact: true, name: "Revoke key" })
    .click();
  const revokeDialog = page
    .locator('[data-slot="dialog-content"]')
    .filter({ has: page.getByRole("heading", { name: "Revoke API key" }) });
  await revokeDialog.getByRole("button", { name: "Revoke key" }).click();
  await page.getByText("API key revoked").waitFor();
  await revokeDialog.waitFor({ state: "hidden" });
  await page
    .locator("tbody tr")
    .filter({ hasText: renamedKeyName })
    .filter({ hasText: "revoked" })
    .waitFor();

  await page.goto(new URL("/keys?keyId=bad&page=1", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(
    (nextUrl) =>
      nextUrl.pathname === "/keys" && nextUrl.searchParams.get("page") === "1",
  );
}

async function testAccountMenu(page: Page, webUrl: string, userEmail: string) {
  await page.goto(new URL("/runs", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Agent runs" }).waitFor();
  await page.getByText(/runs loaded/).waitFor();
  await page.getByRole("button", { name: "Account menu" }).click();
  const accountMenu = page.getByRole("menu");
  await accountMenu.getByText("Dashboard Test").waitFor();
  await accountMenu.getByText(userEmail).waitFor();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page
    .locator('[data-slot="dialog-content"]')
    .filter({ has: page.getByRole("heading", { name: "Sign out" }) })
    .getByRole("button", { name: "Sign out" })
    .click();
  await Promise.race([
    page
      .waitForURL((url) => url.pathname === "/", { timeout: 5_000 })
      .catch(() => undefined),
    page.waitForTimeout(5_000),
  ]);
  assert(
    new URL(page.url()).pathname === "/",
    `sign out did not redirect: ${await page.locator("body").innerText()}`,
  );

  await page.goto(new URL("/runs", webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname === "/");
}

function startWebServer({ apiUrl, port }: { apiUrl: string; port: number }) {
  const child = spawn(
    "bun",
    [
      "--cwd",
      "apps/web",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        VITE_MESH0_API_URL: apiUrl,
      },
      stdio: "pipe",
    },
  );
  const logs: string[] = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  return {
    stop() {
      child.kill();
    },
    logs,
  };
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Unable to resolve free port"));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForReachable(url: string, label: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`${label} did not become reachable at ${url}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDefaultSearch(url: string, expected: Record<string, string>) {
  const searchParams = new URL(url).searchParams;
  for (const [key, value] of Object.entries(expected)) {
    assert(
      searchParams.get(key) === value,
      `expected ${key}=${value}, got ${searchParams.get(key)}`,
    );
  }
}
