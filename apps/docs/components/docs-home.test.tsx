// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/landing/package-install", () => ({
  PackageInstall: () => <div data-testid="install" />,
}));

const { DocsHomeHeader } = await import("./docs-home");

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("DocsHomeHeader", () => {
  it("is a compact docs header: one headline, one lead, then the install box, with no call-to-action buttons or facts row", () => {
    const doc = parse(
      renderToStaticMarkup(
        <DocsHomeHeader headline="Set up verbatra" lead="Run `verbatra init` first." />,
      ),
    );
    const header = doc.querySelector("header");
    expect(header?.querySelectorAll("h1")).toHaveLength(1);
    expect(header?.querySelectorAll("p")).toHaveLength(1);
    expect(header?.querySelector("p code")?.textContent).toBe("verbatra init");
    expect(header?.querySelector('[data-testid="install"]')).not.toBeNull();
    expect(header?.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("DocsHomePaths", () => {
  it("leads each card with the goal as its title and demotes the page name below the body", async () => {
    const { DocsHomePaths } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomePaths
        cards={[
          {
            goal: "Translate a project",
            page: "Quickstart",
            body: "Install the CLI.",
            href: "/docs/quickstart",
          },
        ]}
        locale="en"
      />,
    );
    const card = new DOMParser().parseFromString(markup, "text/html").querySelector("a");
    expect([...(card?.children ?? [])].map((child) => child.textContent)).toEqual([
      "Translate a project",
      "Install the CLI.",
      "Quickstart",
    ]);
    expect(card?.querySelector(".vk-label")).toBeNull();
    expect(card?.classList.contains("grid-rows-subgrid")).toBe(true);
  });
});

describe("DocsHomeSection", () => {
  it("gives its heading the id a card grid below it names itself by", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomeSection id="pick-your-stack" title="Pick your stack">
        <p>cards</p>
      </DocsHomeSection>,
    );
    const heading = new DOMParser().parseFromString(markup, "text/html").querySelector("h2");
    expect(heading?.id).toBe("pick-your-stack");
    expect(heading?.textContent).toBe("Pick your stack");
  });

  it("sets its heading one step of the type scale under the page title", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const heading = parse(
      renderToStaticMarkup(<DocsHomeSection title="Pick your stack">{null}</DocsHomeSection>),
    ).querySelector("h2");
    expect(heading?.classList.contains("vk-h3")).toBe(true);
    expect(heading?.getAttribute("style")).toBeNull();
  });

  it("puts its lead on the header's column template, so leads and the install box share an edge", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const head = parse(
      renderToStaticMarkup(
        <DocsHomeSection title="Pick your stack" lead="Lead">
          {null}
        </DocsHomeSection>,
      ),
    ).querySelector("section > div");
    const header = parse(
      renderToStaticMarkup(<DocsHomeHeader headline="H" lead="L" />),
    ).querySelector("header");
    const template = (element: Element | null | undefined) =>
      [...(element?.classList ?? [])].filter((name) => /^lg:(grid-cols|gap-x)-/.test(name));
    expect(template(head)).toEqual(template(header));
    expect(template(head)).toHaveLength(2);
  });

  it("starts the lead at its column edge and sets a backticked command in code type", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomeSection
        title="Every run is a diff"
        lead="What happens when you run `verbatra translate`."
      >
        <p>body</p>
      </DocsHomeSection>,
    );
    const lead = parse(markup).querySelector(".vk-lead");
    expect(lead?.className).not.toMatch(/justify-self-end/);
    expect(lead?.querySelector("code")?.textContent).toBe("verbatra translate");
  });
});

describe("DocsHomePaths: title rhythm", () => {
  it("keeps a hyphenated compound in a goal title on one line", async () => {
    const { DocsHomePaths } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomePaths
        cards={[{ goal: "Mit einem KI-Agenten arbeiten", page: "P", body: "B", href: "/docs/x" }]}
        locale="de"
      />,
    );
    const title = parse(markup).querySelector("a > span");
    expect(title?.textContent).toBe("Mit einem KI-Agenten arbeiten");
    expect(title?.querySelector(".whitespace-nowrap")?.textContent).toBe("KI-Agenten");
  });
});

describe("prose measure", () => {
  it("leaves an element that is itself not-prose at full width, like its descendants", () => {
    const rule = GLOBAL_CSS.replace(/\s+/g, " ").match(
      /#nd-page \.prose :where\(p, ul, ol, blockquote, \.vk-callout\):not\(:where\(([^)]*)\)\)/,
    );
    expect(rule?.[1]?.split(",").map((part) => part.trim())).toContain(".not-prose");
  });
});
