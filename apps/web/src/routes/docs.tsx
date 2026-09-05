import { docsNavigation, docsPages, docsSearchIndex } from "@mesh0/docs";
import type {
  DocsBlock,
  DocsCodeLanguage,
  DocsCodeTab,
  DocsLanguage,
} from "@mesh0/docs/types";
import { cn } from "@mesh0/ui/lib/utils";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconSearch,
} from "@tabler/icons-react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

type DocsPageValue = (typeof docsPages)[number];
type DocsSectionValue = DocsPageValue["sections"][number];
type DocsSearchEntryValue = (typeof docsSearchIndex)[number];

const docsLanguageSchema = z.enum(["ts", "py", "rs"]);
const defaultDocsPage = docsPages[0];
if (defaultDocsPage === undefined) {
  throw new Error("Docs pages are required");
}

const defaultDocsSearch = {
  language: "ts",
  page: defaultDocsPage.slug,
} satisfies DocsSearch;
const docsSearchSchema = z.strictObject({
  language: docsLanguageSchema.catch("ts"),
  page: z.string().catch(defaultDocsPage.slug),
});
const docsPageTitles = new Map(
  docsPages.map((page) => [page.slug, page.title]),
);

type DocsSearch = z.infer<typeof docsSearchSchema>;

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  validateSearch: (search): DocsSearch => docsSearchSchema.parse(search),
});

function DocsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activePage =
    docsPages.find((page) => page.slug === search.page) ?? defaultDocsPage;
  const [pendingAnchor, setPendingAnchor] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResults = useMemo(() => searchDocs(searchQuery), [searchQuery]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (pendingAnchor === undefined) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(pendingAnchor)?.scrollIntoView({
        block: "start",
      });
      setPendingAnchor(undefined);
    });
  }, [activePage.slug, pendingAnchor]);

  function openSearchResult(entry: DocsSearchEntryValue) {
    setPendingAnchor(getSearchEntryAnchor(entry));
    setSearchQuery("");
    void navigate({
      search: (previous) => ({
        ...previous,
        page: entry.slug,
      }),
    });
  }

  return (
    <main
      className="min-h-svh bg-[var(--mesh-black)] font-mono text-[var(--mesh-white)] [background:linear-gradient(var(--mesh-line),var(--mesh-line))_var(--mesh-page-gutter)_0/1px_100%_no-repeat,linear-gradient(var(--mesh-line),var(--mesh-line))_calc(100%_-_var(--mesh-page-gutter)_-_1px)_0/1px_100%_no-repeat,var(--mesh-black)]"
      style={{ colorScheme: "dark" }}
    >
      <div className="sticky top-0 z-20 border-b border-[var(--mesh-line)] bg-[var(--mesh-black)]/95 backdrop-blur">
        <div className="mx-auto grid min-h-16 w-[min(100%,1440px)] grid-cols-[minmax(0,1fr)] items-center gap-4 px-4 md:grid-cols-[18rem_minmax(18rem,40rem)_1fr] lg:px-8">
          <Link
            className="flex min-w-0 items-center gap-3 font-bold"
            search={defaultDocsSearch}
            to="/docs"
          >
            <span className="grid size-7 place-items-center border border-[var(--mesh-line)] bg-black/30 text-sm text-[var(--mesh-white)]">
              m0
            </span>
            <span>mesh0 docs</span>
          </Link>
          <div className="relative">
            <div className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border border-[var(--mesh-line)] bg-black/30 px-3">
              <IconSearch
                aria-hidden="true"
                className="size-4 text-[var(--mesh-muted)]"
              />
              <input
                ref={searchInputRef}
                aria-label="Search docs"
                className="min-w-0 bg-transparent text-sm text-[var(--mesh-white)] outline-none placeholder:text-[var(--mesh-muted)]"
                placeholder="Search docs"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <span className="text-xs text-[var(--mesh-muted)]">Cmd K</span>
            </div>
            {searchQuery.trim().length > 0 ? (
              <SearchResults
                entries={searchResults}
                onOpen={openSearchResult}
              />
            ) : null}
          </div>
          <a
            className="hidden justify-self-end text-sm font-bold text-[var(--mesh-muted)] hover:text-[var(--mesh-white)] md:inline-flex"
            href="/"
          >
            Product
            <IconExternalLink aria-hidden="true" className="ml-2 size-4" />
          </a>
        </div>
      </div>
      <div className="mx-auto grid w-[min(100%,1440px)] gap-8 px-4 py-8 lg:grid-cols-[18rem_minmax(0,1fr)_15rem] lg:px-8">
        <DocsSidebar activeSlug={activePage.slug} language={search.language} />
        <article className="min-w-0 pb-24">
          <header className="mb-10 grid gap-4 border-b border-[var(--mesh-line)] pb-8">
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--mesh-muted)] uppercase">
              Documentation
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-normal md:text-5xl">
              {activePage.title}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-[var(--mesh-muted)]">
              {activePage.description}
            </p>
          </header>
          <div className="grid gap-12">
            {activePage.sections.map((section) => (
              <DocsSection
                key={section.id}
                language={search.language}
                pageSlug={activePage.slug}
                section={section}
              />
            ))}
          </div>
        </article>
        <OnThisPage sections={activePage.sections} />
      </div>
    </main>
  );
}

function DocsSidebar({
  activeSlug,
  language,
}: {
  activeSlug: string;
  language: DocsLanguage;
}) {
  return (
    <aside className="max-h-72 overflow-auto border-b border-[var(--mesh-line)] pb-6 lg:sticky lg:top-24 lg:max-h-[calc(100svh-7rem)] lg:border-r lg:border-b-0 lg:pr-6 lg:pb-0">
      <nav className="grid gap-8 text-sm" aria-label="Docs navigation">
        {docsNavigation.map((group) => (
          <section key={group.title} className="grid gap-3">
            <h2 className="text-sm font-bold text-[var(--mesh-white)]">
              {group.title}
            </h2>
            <div className="grid gap-1">
              {group.pages.map((slug) => (
                <Link
                  key={slug}
                  className={cn(
                    "border-l-2 border-transparent py-1.5 pl-3 text-[var(--mesh-muted)] transition-colors hover:border-[var(--mesh-line-strong)] hover:text-[var(--mesh-white)]",
                    activeSlug === slug &&
                      "border-[var(--mesh-white)] font-bold text-[var(--mesh-white)]",
                  )}
                  search={{ language, page: slug }}
                  to="/docs"
                >
                  {docsPageTitles.get(slug) ?? slug}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

function OnThisPage({ sections }: { sections: readonly DocsSectionValue[] }) {
  return (
    <aside className="hidden xl:sticky xl:top-24 xl:block xl:max-h-[calc(100svh-7rem)] xl:overflow-auto">
      <nav className="grid gap-3 text-sm" aria-label="On this page">
        <h2 className="font-bold text-[var(--mesh-white)]">On this page</h2>
        {sections.map((section) => (
          <a
            key={section.id}
            className="text-[var(--mesh-muted)] hover:text-[var(--mesh-white)]"
            href={`#${section.id}`}
          >
            {section.title}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function DocsSection({
  language,
  pageSlug,
  section,
}: {
  language: DocsLanguage;
  pageSlug: string;
  section: DocsSectionValue;
}) {
  return (
    <section className="scroll-mt-28" id={section.id}>
      <h2 className="mb-5 text-2xl leading-tight font-bold tracking-normal">
        {section.title}
      </h2>
      <div className="grid gap-5">
        {section.blocks.map((block, index) => (
          <DocsBlockRenderer
            block={block}
            key={`${section.id}-${index}`}
            language={language}
            pageSlug={pageSlug}
          />
        ))}
      </div>
    </section>
  );
}

function DocsBlockRenderer({
  block,
  language,
  pageSlug,
}: {
  block: DocsBlock;
  language: DocsLanguage;
  pageSlug: string;
}) {
  switch (block.type) {
    case "code":
      return <CodePanel code={block.code} language={block.language} />;
    case "codeGroup":
      return (
        <CodeGroup language={language} pageSlug={pageSlug} tabs={block.tabs} />
      );
    case "endpoint":
      return <EndpointBlock block={block} />;
    case "list":
      return (
        <ul className="grid gap-2 pl-5 text-[1rem] leading-7 text-[var(--mesh-muted)] marker:text-[var(--mesh-white)]">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "note":
      return (
        <aside className="border-l-2 border-[var(--mesh-line-strong)] bg-black/20 px-4 py-3">
          <h3 className="mb-1 font-bold">{block.title}</h3>
          <p className="leading-7 text-[var(--mesh-muted)]">{block.text}</p>
        </aside>
      );
    case "paragraph":
      return (
        <p className="max-w-3xl text-[1rem] leading-8 text-[var(--mesh-muted)]">
          {block.text}
        </p>
      );
    case "steps":
      return (
        <ol className="grid gap-4">
          {block.items.map((item, index) => (
            <li
              key={item.title}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"
            >
              <span className="grid size-8 place-items-center border border-[var(--mesh-line)] bg-black/30 text-sm font-bold text-[var(--mesh-white)]">
                {index + 1}
              </span>
              <span className="grid gap-1">
                <span className="font-bold">{item.title}</span>
                <span className="leading-7 text-[var(--mesh-muted)]">
                  {item.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return <DocsTable columns={block.columns} rows={block.rows} />;
  }
}

function CodeGroup({
  language,
  pageSlug,
  tabs,
}: {
  language: DocsLanguage;
  pageSlug: string;
  tabs: readonly DocsCodeTab[];
}) {
  const activeTab = tabs.find((tab) => tab.value === language) ?? tabs[0];
  if (activeTab === undefined) {
    return null;
  }

  return (
    <div className="overflow-hidden border border-[var(--mesh-line)] bg-[var(--mesh-panel)]">
      <div
        aria-label="SDK language"
        className="flex min-h-12 items-center gap-1 px-4"
        role="tablist"
      >
        {tabs.map((tab) => (
          <Link
            aria-selected={activeTab.value === tab.value}
            className="inline-flex min-h-10 items-center border-b-2 border-transparent px-3 text-sm font-bold text-[var(--mesh-muted)] aria-selected:border-[var(--mesh-white)] aria-selected:text-[var(--mesh-white)]"
            key={tab.value}
            role="tab"
            search={{ language: tab.value, page: pageSlug }}
            to="/docs"
          >
            {tab.title}
          </Link>
        ))}
      </div>
      <CodePanel code={activeTab.code} language={activeTab.language} />
    </div>
  );
}

function CodePanel({
  code,
  language,
}: {
  code: string;
  language: DocsCodeLanguage;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  return (
    <div className="relative bg-black/30">
      <button
        aria-label="Copy code"
        className="absolute top-3 right-3 z-10 grid size-8 place-items-center border border-[var(--mesh-line)] bg-[var(--mesh-panel-raised)] text-[var(--mesh-muted)] hover:text-[var(--mesh-white)]"
        type="button"
        onClick={() => void copyCode()}
      >
        {copied ? (
          <IconCheck aria-hidden="true" className="size-4" />
        ) : (
          <IconCopy aria-hidden="true" className="size-4" />
        )}
      </button>
      <pre className="max-h-[34rem] overflow-auto p-5 pr-14 text-sm leading-7 text-[var(--mesh-white)]">
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
}

function EndpointBlock({
  block,
}: {
  block: Extract<DocsBlock, { type: "endpoint" }>;
}) {
  return (
    <section className="grid gap-4 border border-[var(--mesh-line)] bg-black/20 p-4">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid gap-2">
          <h3 className="text-lg font-bold">{block.title}</h3>
          <p className="leading-7 text-[var(--mesh-muted)]">{block.body}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2 font-mono text-sm">
          <span className="border border-[oklch(78%_0.14_145)] px-2 py-1 font-bold text-[oklch(48%_0.14_145)]">
            {block.method}
          </span>
          <span className="min-w-0 break-all text-[var(--mesh-white)]">
            {block.path}
          </span>
        </div>
      </div>
      {block.request === undefined ? null : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2">
            <h4 className="text-sm font-bold text-[var(--mesh-white)]">
              Request
            </h4>
            <CodePanel code={block.request} language="json" />
          </div>
          <div className="grid gap-2">
            <h4 className="text-sm font-bold text-[var(--mesh-white)]">
              Response
            </h4>
            <CodePanel code={block.response ?? "void"} language="json" />
          </div>
        </div>
      )}
    </section>
  );
}

function DocsTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <div className="overflow-auto border border-[var(--mesh-line)]">
      <table className="w-full min-w-[42rem] border-collapse bg-black/20 text-sm">
        <thead>
          <tr className="border-b border-[var(--mesh-line)] bg-[var(--mesh-panel)]">
            {columns.map((column) => (
              <th
                className="px-3 py-3 text-left font-bold text-[var(--mesh-white)]"
                key={column}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              className="border-b border-[var(--mesh-line)] last:border-b-0"
              key={row.join("|") || rowIndex}
            >
              {row.map((cell, index) => (
                <td
                  className="px-3 py-3 align-top leading-6 text-[var(--mesh-muted)]"
                  key={`${rowIndex}-${index}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SearchResults({
  entries,
  onOpen,
}: {
  entries: DocsSearchEntryValue[];
  onOpen: (entry: DocsSearchEntryValue) => void;
}) {
  return (
    <div className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 max-h-96 overflow-auto border border-[var(--mesh-line)] bg-[var(--mesh-panel-raised)] shadow-[0_18px_48px_oklch(0%_0_0/0.36)]">
      {entries.length === 0 ? (
        <div className="p-4 text-sm text-[var(--mesh-muted)]">
          No docs found.
        </div>
      ) : (
        <div className="grid p-2">
          {entries.map((entry) => (
            <button
              className="grid gap-1 px-3 py-2 text-left hover:bg-white/[0.06]"
              key={`${entry.slug}-${getSearchEntryAnchor(entry) ?? "page"}`}
              type="button"
              onClick={() => onOpen(entry)}
            >
              <span className="text-sm font-bold text-[var(--mesh-white)]">
                {entry.title}
              </span>
              <span className="text-xs text-[var(--mesh-muted)]">
                {entry.pageTitle}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function searchDocs(query: string) {
  const tokens = normalizeSearch(query)
    .split(" ")
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [];
  }

  return docsSearchIndex
    .map((entry) => ({
      entry,
      score: scoreSearchEntry(entry, tokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ entry }) => entry);
}

function scoreSearchEntry(entry: DocsSearchEntryValue, tokens: string[]) {
  const title = normalizeSearch(`${entry.pageTitle} ${entry.title}`);
  const text = normalizeSearch(entry.text);

  return tokens.reduce((score, token) => {
    if (title.includes(token)) {
      return score + 8;
    }

    if (text.includes(token)) {
      return score + 2;
    }

    return score;
  }, 0);
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_./-]+/g, " ")
    .trim();
}

function getSearchEntryAnchor(entry: DocsSearchEntryValue) {
  return "anchor" in entry ? entry.anchor : undefined;
}

function highlightCode(code: string, language: DocsCodeLanguage) {
  const keywordPattern = keywordPatterns[language] ?? keywordPatterns.ts;

  return code.split("\n").map((line, lineIndex) => (
    <span key={lineIndex}>
      {highlightLine(line, keywordPattern)}
      {lineIndex === code.split("\n").length - 1 ? null : "\n"}
    </span>
  ));
}

function highlightLine(line: string, keywordPattern: RegExp) {
  const tokens = line.split(
    /(\/\/.*|#.*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|[A-Z]{2,}\s|[{}[\]():,.])/g,
  );

  return tokens.map((token, index) => (
    <span className={tokenClassName(token, keywordPattern)} key={index}>
      {token}
    </span>
  ));
}

function tokenClassName(token: string, keywordPattern: RegExp) {
  if (token.length === 0) {
    return undefined;
  }

  if (token.startsWith("//") || token.startsWith("#")) {
    return "text-[oklch(58%_0_0)]";
  }

  if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
    return "text-[oklch(42%_0.13_145)]";
  }

  if (/^\d/.test(token)) {
    return "text-[oklch(48%_0.13_265)]";
  }

  if (/^[A-Z]{2,}\s?$/.test(token)) {
    return "font-bold text-[oklch(58%_0.16_35)]";
  }

  if (keywordPattern.test(token)) {
    return "font-bold text-[oklch(58%_0.16_35)]";
  }

  return undefined;
}

const keywordPatterns = {
  bash: /\b(?:bun|cargo|python3|pip|install|add)\b/,
  http: /\b(?:Authorization|Bearer|Content-Type|Accept|HTTP)\b/,
  json: /\b(?:true|false|null)\b/,
  py: /\b(?:from|import|for|in|def|class|return|None|True|False|print)\b/,
  rs: /\b(?:use|let|mut|pub|fn|impl|struct|enum|Result|Ok|Err)\b/,
  ts: /\b(?:import|from|const|let|await|async|for|of|return|new|type|interface)\b/,
} satisfies Record<DocsCodeLanguage, RegExp>;
