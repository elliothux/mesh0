import { workspaceSnapshotManifestSchema } from "@mesh0/sdk/schema";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceSnapshot } from "../../packages/runner/src/workspace-snapshot";

test("createWorkspaceSnapshot packs files and applies gitignore plus configured ignores", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesh0-workspace-snapshot-"));
  try {
    const workspace = join(root, "workspace");
    const output = join(root, "output");
    await mkdir(join(workspace, "src"), { recursive: true });
    await mkdir(join(workspace, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(workspace, "custom-cache"), { recursive: true });
    await writeFile(join(workspace, ".gitignore"), "ignored.txt\n");
    await writeFile(join(workspace, "src", "app.ts"), "console.log('ok');\n");
    await writeFile(join(workspace, "ignored.txt"), "ignored");
    await writeFile(join(workspace, "node_modules", "pkg", "index.js"), "dep");
    await writeFile(join(workspace, "custom-cache", "state.json"), "{}");

    const snapshot = await createWorkspaceSnapshot({
      ignorePatterns: ["custom-cache/"],
      runId: "run_test",
      workspace,
      workspaceOutputDir: output,
    });
    const manifest = workspaceSnapshotManifestSchema.parse(
      JSON.parse(await readFile(snapshot.manifestPath, "utf8")),
    );
    const paths = manifest.entries.map(({ path }) => path);

    expect(paths).toContain(".gitignore");
    expect(paths).toContain("src");
    expect(paths).toContain("src/app.ts");
    expect(paths).not.toContain("ignored.txt");
    expect(paths).not.toContain("node_modules");
    expect(paths).not.toContain("custom-cache");

    const appEntry = manifest.entries.find(
      (entry) => entry.type === "file" && entry.path === "src/app.ts",
    );
    expect(appEntry?.type).toBe("file");
    if (appEntry?.type !== "file") {
      throw new Error("src/app.ts entry missing");
    }

    expect(appEntry.segments).toHaveLength(1);
    const [segment] = appEntry.segments;
    expect(segment?.key).toBe("output/workspace/packs/pack-00000.bin");
    const pack = await readFile(join(output, "packs", "pack-00000.bin"));
    expect(
      pack
        .subarray(segment?.offset ?? 0, (segment?.offset ?? 0) + appEntry.size)
        .toString(),
    ).toBe("console.log('ok');\n");
    expect(
      snapshot.outputObjects.some(
        (object) =>
          object.key === "runs/run_test/output/workspace/manifest.json",
      ),
    ).toBe(true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
