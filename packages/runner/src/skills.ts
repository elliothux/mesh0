import type { McpServers, RunnerRunConfig, SkillRef } from "@mesh0/sdk/types";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { runCommand } from "./io";

const SKILL_FILE = "SKILL.md";
const SKILL_METADATA_FILE = "agents/openai.yaml";
const SKILL_LOCK_FILE = "skills-lock.json";
const WELL_KNOWN_PATHS = [".well-known/agent-skills", ".well-known/skills"];
const DISCOVERY_DIRS = [
  "skills",
  "skills/.curated",
  "skills/.experimental",
  "skills/.system",
];

const frontmatterSchema = z.looseObject({
  description: z.string().min(1),
  name: z.string().min(1).max(64),
});

const dependencyToolSchema = z.looseObject({
  command: z.string().optional(),
  description: z.string().optional(),
  transport: z.string().optional(),
  type: z.string().min(1),
  url: z.string().optional(),
  value: z.string().min(1),
});

const skillMetadataFileSchema = z.looseObject({
  dependencies: z
    .looseObject({
      tools: z.array(dependencyToolSchema).default([]),
    })
    .optional(),
});

const wellKnownSkillEntrySchema = z.looseObject({
  description: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
  name: z.string().min(1),
});

const wellKnownIndexSchema = z.looseObject({
  skills: z.array(wellKnownSkillEntrySchema),
});

type SkillMetadata = z.infer<typeof frontmatterSchema> & {
  dependencies: SkillToolDependency[];
};

type SkillToolDependency = z.infer<typeof dependencyToolSchema>;

type WellKnownSkillEntry = z.infer<typeof wellKnownSkillEntrySchema>;

interface SkillSourceDirectory {
  dir: string;
  installName?: string;
  resolvedRef?: string;
  sourcePath?: string;
  sourceType: SkillRef["source"];
  sourceUrl: string;
}

export interface PreparedSkill {
  description: string;
  digest: string;
  name: string;
  path: string;
  resolvedRef?: string;
  sourcePath?: string;
  sourceType: SkillRef["source"];
  sourceUrl: string;
}

interface WellKnownIndexResult {
  index: z.infer<typeof wellKnownIndexSchema>;
  indexUrl: string;
  resolvedBaseUrl: string;
  resolvedWellKnownPath: string;
}

export async function prepareSkills({
  config,
  log,
  runtimeDir,
}: {
  config: RunnerRunConfig;
  log: (message: string) => Promise<void>;
  runtimeDir: string;
}) {
  const skillsRoot = join(runtimeDir, "skills");
  await rm(skillsRoot, { force: true, recursive: true });
  await mkdir(skillsRoot, { recursive: true });

  const skills = config.skills ?? [];
  if (skills.length === 0) {
    await writeSkillsLock(runtimeDir, []);
    return [];
  }

  const preparedSkills: PreparedSkill[] = [];
  const installNames = new Set<string>();

  for (const [index, skill] of skills.entries()) {
    const source =
      skill.source === "git"
        ? await resolveGitSkillSource({ index, runtimeDir, skill })
        : await resolveWellKnownSkillSource({ runtimeDir, skill });
    const prepared = await installSkillSource({
      installNames,
      mcpServers: config.mcpServers,
      skillsRoot,
      source,
    });
    preparedSkills.push(prepared);
    await log(`skill ${prepared.name} prepared at ${prepared.path}`);
  }

  await writeSkillsLock(runtimeDir, preparedSkills);

  return preparedSkills;
}

async function writeSkillsLock(
  runtimeDir: string,
  preparedSkills: PreparedSkill[],
) {
  await writeFile(
    join(runtimeDir, SKILL_LOCK_FILE),
    `${JSON.stringify({ skills: preparedSkills }, null, 2)}\n`,
  );
}

function parseSkillFrontmatter(contents: string) {
  const parsed: unknown = parseYaml(extractFrontmatter(contents));
  const frontmatter = frontmatterSchema.parse(parsed);
  return {
    description: sanitizeSingleLine(frontmatter.description),
    name: sanitizeSingleLine(frontmatter.name),
  };
}

async function resolveGitSkillSource({
  index,
  runtimeDir,
  skill,
}: {
  index: number;
  runtimeDir: string;
  skill: Extract<SkillRef, { source: "git" }>;
}): Promise<SkillSourceDirectory> {
  const cloneDir = await mkdtemp(join(runtimeDir, `skill-git-${index}-`));
  await runCommand("git", ["clone", "--no-tags", skill.url, cloneDir], {
    check: true,
    secrets: [skill.url],
  });
  await runCommand("git", ["-C", cloneDir, "checkout", skill.ref], {
    check: true,
  });
  const resolvedRef = (
    await runCommand("git", ["-C", cloneDir, "rev-parse", "HEAD"], {
      check: true,
    })
  ).stdout.trim();

  if (skill.path !== undefined) {
    const sourcePath = safeRelativePath(skill.path);
    return {
      dir: resolveSafeSubpath(cloneDir, sourcePath),
      resolvedRef,
      sourcePath,
      sourceType: "git",
      sourceUrl: skill.url,
    };
  }

  const dir = await selectDiscoveredSkillDir({
    root: cloneDir,
    skillName: skill.skill,
  });

  return {
    dir,
    resolvedRef,
    sourcePath: relativePosix(cloneDir, dir),
    sourceType: "git",
    sourceUrl: skill.url,
  };
}

async function resolveWellKnownSkillSource({
  runtimeDir,
  skill,
}: {
  runtimeDir: string;
  skill: Extract<SkillRef, { source: "well-known" }>;
}): Promise<SkillSourceDirectory> {
  const result = await fetchWellKnownIndex(skill.url);
  const skillName =
    skill.skill ??
    skillNameFromWellKnownUrl(skill.url) ??
    singleWellKnownSkillName(result.index.skills);

  if (skillName === undefined) {
    throw new Error(
      `well-known source ${skill.url} contains multiple skills; provide skill`,
    );
  }

  const entry = result.index.skills.find((item) => item.name === skillName);
  if (entry === undefined) {
    throw new Error(
      `well-known source ${skill.url} does not contain ${skillName}`,
    );
  }

  const sourceDir = await mkdtemp(join(runtimeDir, "skill-wellknown-"));
  const skillDir = join(sourceDir, entry.name);
  await mkdir(skillDir, { recursive: true });

  for (const file of entry.files) {
    const safeFile = safeRelativePath(file);
    const fileUrl = buildWellKnownFileUrl({
      baseUrl: result.resolvedBaseUrl,
      filePath: safeFile,
      skillName: entry.name,
      wellKnownPath: result.resolvedWellKnownPath,
    });
    const response = await fetchOk(fileUrl);
    const destination = resolveSafeSubpath(skillDir, safeFile);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }

  return {
    dir: skillDir,
    installName: entry.name,
    sourcePath: `${result.resolvedWellKnownPath}/${entry.name}`,
    sourceType: "well-known",
    sourceUrl: result.indexUrl,
  };
}

async function installSkillSource({
  installNames,
  mcpServers,
  skillsRoot,
  source,
}: {
  installNames: Set<string>;
  mcpServers: McpServers | undefined;
  skillsRoot: string;
  source: SkillSourceDirectory;
}): Promise<PreparedSkill> {
  await assertSkillDirectory(source.dir);
  const metadata = await readSkillMetadata(source.dir);
  validateMcpDependencies({
    dependencies: metadata.dependencies,
    mcpServers,
    skillName: metadata.name,
  });

  const installName = safeInstallName(source.installName ?? metadata.name);
  if (installNames.has(installName)) {
    throw new Error(`duplicate skill install name: ${installName}`);
  }
  installNames.add(installName);

  const targetDir = join(skillsRoot, installName);
  await copySkillDirectory(source.dir, targetDir);

  return {
    description: metadata.description,
    digest: await sha256Directory(targetDir),
    name: metadata.name,
    path: join(targetDir, SKILL_FILE),
    resolvedRef: source.resolvedRef,
    sourcePath: source.sourcePath,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
  };
}

async function readSkillMetadata(skillDir: string): Promise<SkillMetadata> {
  const frontmatter = parseSkillFrontmatter(
    await readFile(join(skillDir, SKILL_FILE), "utf8"),
  );
  const metadataPath = join(skillDir, SKILL_METADATA_FILE);
  if (!(await pathExists(metadataPath))) {
    return { ...frontmatter, dependencies: [] };
  }

  try {
    const parsed: unknown = parseYaml(await readFile(metadataPath, "utf8"));
    const metadata = skillMetadataFileSchema.parse(parsed);
    return {
      ...frontmatter,
      dependencies: metadata.dependencies?.tools ?? [],
    };
  } catch (error) {
    throw new Error(
      `${metadataPath} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateMcpDependencies({
  dependencies,
  mcpServers,
  skillName,
}: {
  dependencies: SkillToolDependency[];
  mcpServers: McpServers | undefined;
  skillName: string;
}) {
  const serverNames = new Set(Object.keys(mcpServers ?? {}));
  for (const dependency of dependencies) {
    if (dependency.type !== "mcp") {
      continue;
    }
    if (!serverNames.has(dependency.value)) {
      throw new Error(
        `skill ${skillName} requires MCP server ${dependency.value}`,
      );
    }
  }
}

async function fetchWellKnownIndex(url: string): Promise<WellKnownIndexResult> {
  const parsed = new URL(url);
  const basePath = parsed.pathname.replace(/\/$/, "");
  const candidates: Array<{
    baseUrl: string;
    indexUrl: string;
    wellKnownPath: string;
  }> = [];

  for (const wellKnownPath of WELL_KNOWN_PATHS) {
    candidates.push({
      baseUrl: `${parsed.protocol}//${parsed.host}${basePath}`,
      indexUrl: `${parsed.protocol}//${parsed.host}${basePath}/${wellKnownPath}/index.json`,
      wellKnownPath,
    });
    if (basePath.length > 0) {
      candidates.push({
        baseUrl: `${parsed.protocol}//${parsed.host}`,
        indexUrl: `${parsed.protocol}//${parsed.host}/${wellKnownPath}/index.json`,
        wellKnownPath,
      });
    }
  }

  for (const candidate of candidates) {
    const response = await fetch(candidate.indexUrl);
    if (!response.ok) {
      continue;
    }

    const value: unknown = await response.json();
    const index = wellKnownIndexSchema.parse(value);
    for (const entry of index.skills) {
      validateWellKnownSkillEntry(entry);
    }

    return {
      index,
      indexUrl: candidate.indexUrl,
      resolvedBaseUrl: candidate.baseUrl,
      resolvedWellKnownPath: candidate.wellKnownPath,
    };
  }

  throw new Error(`well-known skills index not found for ${url}`);
}

function validateWellKnownSkillEntry(entry: WellKnownSkillEntry) {
  const namePattern = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
  if (!namePattern.test(entry.name)) {
    throw new Error(`invalid well-known skill name: ${entry.name}`);
  }

  const hasSkillFile = entry.files.some(
    (file) => file.toLowerCase() === SKILL_FILE.toLowerCase(),
  );
  if (!hasSkillFile) {
    throw new Error(`well-known skill ${entry.name} is missing ${SKILL_FILE}`);
  }

  for (const file of entry.files) {
    safeRelativePath(file);
  }
}

async function selectDiscoveredSkillDir({
  root,
  skillName,
}: {
  root: string;
  skillName: string | undefined;
}) {
  const skillDirs = await discoverSkillDirs(root);
  if (skillName !== undefined) {
    const matches: string[] = [];
    for (const dir of skillDirs) {
      const metadata = parseSkillFrontmatter(
        await readFile(join(dir, SKILL_FILE), "utf8"),
      );
      if (metadata.name === skillName) {
        matches.push(dir);
      }
    }
    const [match] = matches;
    if (matches.length !== 1 || match === undefined) {
      throw new Error(
        `expected one git skill named ${skillName}, found ${matches.length}`,
      );
    }
    return match;
  }

  const [dir] = skillDirs;
  if (skillDirs.length !== 1 || dir === undefined) {
    throw new Error(
      `git source contains ${skillDirs.length} skills; provide path or skill`,
    );
  }

  return dir;
}

async function discoverSkillDirs(root: string) {
  const dirs = new Set<string>();
  if (await pathExists(join(root, SKILL_FILE))) {
    dirs.add(root);
  }

  for (const discoveryDir of DISCOVERY_DIRS) {
    const container = join(root, discoveryDir);
    if (!(await directoryExists(container))) {
      continue;
    }

    const entries = await readdir(container, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dir = join(container, entry.name);
      if (await pathExists(join(dir, SKILL_FILE))) {
        dirs.add(dir);
      }
    }
  }

  return [...dirs].sort();
}

async function assertSkillDirectory(dir: string) {
  const skillPath = join(dir, SKILL_FILE);
  const stats = await stat(skillPath);
  if (!stats.isFile()) {
    throw new Error(`${skillPath} must be a file`);
  }
}

async function copySkillDirectory(sourceDir: string, targetDir: string) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (isBlockedSkillCopyName(entry.name)) {
      continue;
    }

    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink is not allowed in skill: ${source}`);
    }
    if (entry.isDirectory()) {
      await copySkillDirectory(source, target);
      continue;
    }
    if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}

async function sha256Directory(root: string) {
  const hash = createHash("sha256");
  const files = await listFiles(root);
  for (const file of files.sort()) {
    const relativePath = relativePosix(root, file);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink is not allowed in skill: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
      continue;
    }
    if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function extractFrontmatter(contents: string) {
  const lines = contents.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`missing YAML frontmatter delimited by ---`);
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      return lines.slice(1, index).join("\n");
    }
  }

  throw new Error(`missing YAML frontmatter delimited by ---`);
}

function sanitizeSingleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function safeRelativePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.includes("..")
  ) {
    throw new Error(`unsafe skill path: ${path}`);
  }

  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        (segment.startsWith(".") && !isAllowedSkillSourceSegment(segment)),
    )
  ) {
    throw new Error(`unsafe skill path: ${path}`);
  }

  return normalized;
}

function resolveSafeSubpath(root: string, subpath: string) {
  const resolved = resolve(root, subpath);
  const relativePath = relative(root, resolved);
  if (relativePath.startsWith("..") || relativePath.includes("\0")) {
    throw new Error(`unsafe skill path: ${subpath}`);
  }
  return resolved;
}

function safeInstallName(name: string) {
  const safeName = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (safeName.length === 0 || safeName === "." || safeName === "..") {
    throw new Error(`invalid skill name: ${name}`);
  }
  return basename(safeName);
}

function isBlockedSkillCopyName(name: string) {
  return name === ".git" || name === "node_modules" || name.startsWith(".");
}

function isAllowedSkillSourceSegment(segment: string) {
  return (
    segment === ".curated" ||
    segment === ".experimental" ||
    segment === ".system"
  );
}

function relativePosix(root: string, path: string) {
  return relative(root, path).split(sep).join("/");
}

function buildWellKnownFileUrl({
  baseUrl,
  filePath,
  skillName,
  wellKnownPath,
}: {
  baseUrl: string;
  filePath: string;
  skillName: string;
  wellKnownPath: string;
}) {
  const path = [...wellKnownPath.split("/"), skillName, ...filePath.split("/")]
    .map(encodeURIComponent)
    .join("/");
  return `${baseUrl.replace(/\/$/, "")}/${path}`;
}

function skillNameFromWellKnownUrl(url: string) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(
    /\/.well-known\/(?:agent-skills|skills)\/([^/]+)\/?$/,
  );
  const name = match?.[1];
  return name === undefined ? undefined : decodeURIComponent(name);
}

function singleWellKnownSkillName(skills: WellKnownSkillEntry[]) {
  return skills.length === 1 ? skills[0]?.name : undefined;
}

async function fetchOk(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch ${url} failed with status ${response.status}`);
  }
  return response;
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function directoryExists(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
