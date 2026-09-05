export type DocsLanguage = "ts" | "py" | "rs";

export type DocsCodeLanguage = "bash" | "http" | "json" | "py" | "rs" | "ts";

export type DocsNavigationGroup = {
  pages: string[];
  title: string;
};

export type DocsCodeTab = {
  code: string;
  language: DocsCodeLanguage;
  title: string;
  value: DocsLanguage;
};

export type DocsBlock =
  | {
      text: string;
      type: "paragraph";
    }
  | {
      items: string[];
      type: "list";
    }
  | {
      text: string;
      title: string;
      type: "note";
    }
  | {
      items: { body: string; title: string }[];
      type: "steps";
    }
  | {
      code: string;
      language: DocsCodeLanguage;
      title?: string;
      type: "code";
    }
  | {
      tabs: DocsCodeTab[];
      type: "codeGroup";
    }
  | {
      columns: string[];
      rows: string[][];
      type: "table";
    }
  | {
      body: string;
      method: "DELETE" | "GET" | "POST" | "PUT";
      path: string;
      request?: string;
      response?: string;
      title: string;
      type: "endpoint";
    };

export type DocsSection = {
  blocks: DocsBlock[];
  id: string;
  title: string;
};

export type DocsPage = {
  description: string;
  sections: DocsSection[];
  slug: string;
  title: string;
};

export type DocsSearchEntry = {
  anchor?: string;
  pageDescription: string;
  pageTitle: string;
  slug: string;
  text: string;
  title: string;
};
