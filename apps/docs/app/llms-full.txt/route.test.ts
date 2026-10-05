import { describe, expect, it, vi } from "vitest";

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
    data: { title: "verbatra check", type: "reference", getText: async () => "Report drift." },
  },
];

vi.mock("@/lib/source", () => ({ source: { getPages: () => PAGES } }));

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
});
