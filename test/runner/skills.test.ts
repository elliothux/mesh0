import type { RunnerRunConfig } from "@mesh0/sdk/types";
import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { mcpServerConfigSchema } from "../../apps/sdk/src/schema";
import { runCommand } from "../../packages/runner/src/io";
import { prepareSkills } from "../../packages/runner/src/skills";

const skillsLockSchema = z.strictObject({
  skills: z.array(
    z.looseObject({
      digest: z.string(),
    }),
  ),
});

test("MCP server config supports stdio and streamable HTTP", () => {
  expect(
    mcpServerConfigSchema.safeParse({ command: "github-mcp" }).success,
  ).toBe(true);
  expect(
    mcpServerConfigSchema.safeParse({ url: "https://example.com/mcp" }).success,
  ).toBe(true);
  expect(
    mcpServerConfigSchema.safeParse({ url: "ftp://example.com/mcp" }).success,
  ).toBe(false);
});

test("prepareSkills installs git skills and validates MCP dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesh0-runner-skills-"));
  try {
    const repo = join(root, "repo");
    await mkdir(join(repo, "skills", "review", "agents"), {
      recursive: true,
    });
    await writeFile(
      join(repo, "skills", "review", "SKILL.md"),
      [
        "---",
        "name: review",
        "description: Review code changes.",
        "---",
        "",
        "# Review",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(repo, "skills", "review", "agents", "openai.yaml"),
      [
        "dependencies:",
        "  tools:",
        '    - type: "mcp"',
        '      value: "github"',
        "",
      ].join("\n"),
    );
    await runCommand("git", ["-C", repo, "init"], { check: true });
    await runCommand(
      "git",
      ["-C", repo, "config", "user.email", "test@example.com"],
      {
        check: true,
      },
    );
    await runCommand("git", ["-C", repo, "config", "user.name", "Test"], {
      check: true,
    });
    await runCommand("git", ["-C", repo, "add", "."], { check: true });
    await runCommand("git", ["-C", repo, "commit", "-m", "add skill"], {
      check: true,
    });
    const commit = (
      await runCommand("git", ["-C", repo, "rev-parse", "HEAD"], {
        check: true,
      })
    ).stdout.trim();

    const runtimeDir = join(root, "runtime");
    await mkdir(runtimeDir);
    const config: RunnerRunConfig = {
      env: {
        OPENAI_API_KEY: "test",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MODEL: "gpt-5",
      },
      mcpServers: {
        github: {
          url: "https://example.com/mcp",
        },
      },
      prompt: "run",
      skills: [
        {
          path: "skills/review",
          ref: commit,
          source: "git",
          url: repo,
        },
      ],
    };

    const prepared = await prepareSkills({
      config,
      log: async () => {},
      runtimeDir,
    });

    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.name).toBe("review");
    expect(prepared[0]?.resolvedRef).toBe(commit);
    await expect(
      readFile(join(runtimeDir, "skills", "review", "SKILL.md"), "utf8"),
    ).resolves.toContain("# Review");

    const rawLock: unknown = JSON.parse(
      await readFile(join(runtimeDir, "skills-lock.json"), "utf8"),
    );
    const lock = skillsLockSchema.parse(rawLock);
    expect(lock.skills[0].digest).toStartWith("sha256:");

    const emptyPrepared = await prepareSkills({
      config: {
        ...config,
        skills: undefined,
      },
      log: async () => {},
      runtimeDir,
    });
    expect(emptyPrepared).toHaveLength(0);
    expect(await readdir(join(runtimeDir, "skills"))).toHaveLength(0);
    expect(await readFile(join(runtimeDir, "skills-lock.json"), "utf8")).toBe(
      '{\n  "skills": []\n}\n',
    );

    const missingMcpConfig: RunnerRunConfig = {
      ...config,
      mcpServers: undefined,
    };
    await expect(
      prepareSkills({
        config: missingMcpConfig,
        log: async () => {},
        runtimeDir: join(root, "missing-mcp-runtime"),
      }),
    ).rejects.toThrow("requires MCP server github");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prepareSkills installs well-known skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesh0-runner-well-known-"));
  const server = Bun.serve({
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/.well-known/agent-skills/index.json") {
        return Response.json({
          $schema: "https://schemas.example.com/agent-skills.json",
          skills: [
            {
              description: "Use project docs.",
              digest: "sha256:example",
              files: ["SKILL.md", "references/guide.md"],
              name: "docs",
            },
          ],
        });
      }
      if (path === "/.well-known/agent-skills/docs/SKILL.md") {
        return new Response(
          [
            "---",
            "name: docs",
            "description: Use project docs.",
            "---",
            "",
            "# Docs",
            "",
          ].join("\n"),
        );
      }
      if (path === "/.well-known/agent-skills/docs/references/guide.md") {
        return new Response("guide");
      }
      return new Response("not found", { status: 404 });
    },
    port: 0,
  });

  try {
    const runtimeDir = join(root, "runtime");
    await mkdir(runtimeDir);
    const config: RunnerRunConfig = {
      env: {
        OPENAI_API_KEY: "test",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MODEL: "gpt-5",
      },
      prompt: "run",
      skills: [
        {
          skill: "docs",
          source: "well-known",
          url: `http://127.0.0.1:${server.port}`,
        },
      ],
    };

    const prepared = await prepareSkills({
      config,
      log: async () => {},
      runtimeDir,
    });

    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.name).toBe("docs");
    await expect(
      readFile(
        join(runtimeDir, "skills", "docs", "references", "guide.md"),
        "utf8",
      ),
    ).resolves.toBe("guide");
  } finally {
    server.stop(true);
    await rm(root, { force: true, recursive: true });
  }
});
