import { describe, expect, it, vi } from "vitest";

interface FakePage {
  readonly url: string;
  readonly data: {
    readonly title: string;
    readonly description?: string;
    readonly type?: "concept";
    readonly getText: (kind: "processed") => Promise<string>;
  };
}

const PAGES: Record<string, Record<string, FakePage>> = {
  en: {
    "the-lock-file": {
      url: "/docs/the-lock-file",
      data: {
        title: "The lock file",
        description: "How verbatra.lock.json works.",
        type: "concept",
        getText: async () => "## Baseline\n\nOne hash per key.",
      },
    },
    "": {
      url: "/docs",
      data: { title: "Introduction", getText: async () => "Welcome." },
    },
  },
  de: {
    "the-lock-file": {
      url: "/de/docs/the-lock-file",
      data: {
        title: "Die Lock-Datei",
        description: "Wie verbatra.lock.json funktioniert.",
        getText: async () =>
          "## Baseline\n\nEin Hash pro Key, siehe [Formate](/de/docs/formats#yaml).\n\n```md\n[x](/docs/a)\n```",
      },
    },
  },
};

const getPage = vi.fn(
  (slugs: readonly string[] | undefined, locale: string) =>
    PAGES[locale]?.[(slugs ?? []).join("/")] ?? PAGES.en?.[(slugs ?? []).join("/")],
);

vi.mock("@/lib/source", () => ({
  source: {
    getPage: (slugs: readonly string[] | undefined, locale: string) => getPage(slugs, locale),
    generateParams: () => [],
  },
}));

const { GET } = await import("./route");

function request(slug: string[] | undefined, lang: string) {
  return GET(new Request("http://localhost/docs.mdx"), {
    params: Promise.resolve({ slug, lang }),
  });
}

describe("GET /[lang]/docs.mdx/[[...slug]]", () => {
  it.each([
    [["the-lock-file"], "en", "https://verbatra.kreitz-webdev.de/docs/the-lock-file"],
    [["the-lock-file"], "de", "https://verbatra.kreitz-webdev.de/de/docs/the-lock-file"],
    [undefined, "en", "https://verbatra.kreitz-webdev.de/docs"],
  ])(
    "names the HTML page as canonical for %s in %s, so the Markdown copy is no duplicate",
    async (slug, lang, html) => {
      const response = await request(slug, lang);
      expect(response.headers.get("link")).toBe(`<${html}>; rel="canonical"`);
    },
  );

  it("serves the page as Markdown with its frontmatter, title, and description on top", async () => {
    const response = await request(["the-lock-file"], "en");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await response.text()).toBe(
      '---\ntitle: "The lock file"\ndescription: "How verbatra.lock.json works."\ntype: "concept"\n---\n# The lock file\n\nHow verbatra.lock.json works.\n\n## Baseline\n\nOne hash per key.',
    );
  });

  it("serves the locale's own content for a non-default locale", async () => {
    const body = await (await request(["the-lock-file"], "de")).text();
    expect(body).toContain("# Die Lock-Datei");
    expect(body).toContain("Ein Hash pro Key");
  });

  it("serves site-relative links as absolute markdown URLs and leaves code fences alone", async () => {
    const body = await (await request(["the-lock-file"], "de")).text();
    expect(body).toContain("[Formate](https://verbatra.kreitz-webdev.de/de/docs/formats.md#yaml)");
    expect(body).toContain("```md\n[x](/docs/a)\n```");
  });

  it("omits the description block when the page has none", async () => {
    const body = await (await request(undefined, "en")).text();
    expect(body).toBe('---\ntitle: "Introduction"\n---\n# Introduction\n\nWelcome.');
  });

  it("returns 404 for a slug with no matching page", async () => {
    expect((await request(["does-not-exist"], "en")).status).toBe(404);
  });

  it("returns 404 for an unknown locale without consulting the source", async () => {
    getPage.mockClear();
    expect((await request(["the-lock-file"], "xx")).status).toBe(404);
    expect(getPage).not.toHaveBeenCalled();
  });
});
