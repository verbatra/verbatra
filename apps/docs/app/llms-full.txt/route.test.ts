import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const PAGES = [
  {
    url: "/docs/quickstart",
    data: {
      title: "Quickstart",
      description: "Translate your first file.",
      type: "tutorial",
      getText: async () => "Install the CLI.",
    },
  },
  {
    url: "/docs/cli/check",
    data: {
      title: "verbatra check",
      type: "reference",
      getText: async () => "Report drift, then [translate](/docs/cli/translate).",
    },
  },
];

vi.mock("@/lib/source", () => ({ source: { getPages: () => PAGES } }));

vi.mock(
  "next-intl/server",
  async () => (await import("@/test-support/catalog-intl")).catalogIntlServer,
);

const RETIRED_LANDING_SECTIONS = [
  "Verbatra in numbers",
  "Locale files drift every time you ship.",
  "Use it from the terminal or from your own code.",
  "Review every locale in Verbatra Studio.",
  "See it work.",
  "Fits the project you already have.",
  "Open source under the MIT license.",
] as const;

const { GET } = await import("./route");
const body = await (await GET()).text();

describe("llms-full.txt", () => {
  it("opens every page with its frontmatter, then its heading and content", () => {
    expect(body).toContain(
      '---\ntitle: "Quickstart"\ndescription: "Translate your first file."\ntype: "tutorial"\n---\n# Quickstart (https://verbatra.kreitz-webdev.de/docs/quickstart)\n\nInstall the CLI.',
    );
  });

  it("starts the next page at its own frontmatter fence", () => {
    expect(body).toContain(
      'Install the CLI.\n\n---\ntitle: "verbatra check"\ntype: "reference"\n---\n# verbatra check',
    );
  });

  it("serves site-relative links in page content as absolute markdown URLs", () => {
    expect(body).toContain(
      "Report drift, then [translate](https://verbatra.kreitz-webdev.de/docs/cli/translate.md).",
    );
  });

  it("starts with the landing markdown, then the comparison, then the docs pages", () => {
    const landing = body.indexOf(`# ${en.landing.banner.headline}\n`);
    const compare = body.indexOf(`# ${en.compare.heading}\n`);
    const docs = body.indexOf("# Quickstart (");
    expect(landing).toBeGreaterThan(0);
    expect(compare).toBeGreaterThan(landing);
    expect(docs).toBeGreaterThan(compare);
    for (const heading of [en.landing.flow.heading, en.landing.faq.heading]) {
      expect(body.indexOf(heading)).toBeLessThan(compare);
    }
  });

  it("names no retired landing section", () => {
    for (const heading of RETIRED_LANDING_SECTIONS) expect(body).not.toContain(heading);
  });
});
