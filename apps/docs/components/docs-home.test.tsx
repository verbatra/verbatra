// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { DocsHomeAgentTip, DocsHomeHeader, DocsHomeNote, DocsHomeTabs } = await import(
  "./docs-home"
);

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("DocsHomeHeader", () => {
  it("is a compact docs header: eyebrow, one headline, one lead, with no install box, buttons or links of its own", () => {
    const doc = parse(
      renderToStaticMarkup(
        <DocsHomeHeader
          eyebrow="Documentation"
          headline="Set up verbatra"
          lead="Run `verbatra init` first."
        />,
      ),
    );
    const header = doc.querySelector("header");
    expect(header?.querySelectorAll("h1")).toHaveLength(1);
    const [eyebrow, lead] = [...(header?.querySelectorAll("p") ?? [])];
    expect(eyebrow?.textContent).toBe("Documentation");
    expect(eyebrow?.classList.contains("vk-label")).toBe(true);
    expect(eyebrow?.nextElementSibling?.tagName).toBe("H1");
    expect(lead?.querySelector("code")?.textContent).toBe("verbatra init");
    expect(header?.querySelectorAll("a, button, code[class*='vk-edge-fade']")).toHaveLength(0);
    expect(header?.querySelector("h1")?.classList.contains("vk-docs-home-title")).toBe(true);
    expect(lead?.classList.contains("vk-docs-home-lead")).toBe(true);
    expect(GLOBAL_CSS).toMatch(
      /#nd-page \.vk-docs-home-lead \{[^}]*font-size: var\(--text-base\);/,
    );
    const title = /#nd-page \.vk-docs-home-title \{([^}]*)\}/.exec(GLOBAL_CSS)?.[1] ?? "";
    expect(title).toContain("font-size: var(--text-h3);");
    expect(title).toContain("font-weight: 500;");
  });

  it("renders the tabs and the agent tip it is given under the lead", () => {
    const header = parse(
      renderToStaticMarkup(
        <DocsHomeHeader eyebrow="E" headline="H" lead="L">
          <nav aria-label="tabs" />
        </DocsHomeHeader>,
      ),
    ).querySelector("header");
    expect(header?.lastElementChild?.getAttribute("aria-label")).toBe("tabs");
  });
});

describe("DocsHomeTabs", () => {
  const tabs = [
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "CLI", href: "/docs/cli" },
  ];

  it("is a named nav of plain links, prefixed with the reader's locale, with no active tab", () => {
    const nav = parse(
      renderToStaticMarkup(<DocsHomeTabs label="Entry points" tabs={tabs} locale="de" />),
    ).querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Entry points");
    const links = [...(nav?.querySelectorAll("li > a") ?? [])];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Quickstart", "/de/docs/quickstart"],
      ["CLI", "/de/docs/cli"],
    ]);
    expect(nav?.querySelector("[aria-current]")).toBeNull();
    expect(links.map((link) => link.getAttribute("data-umami-event-target"))).toEqual([
      "/docs/quickstart",
      "/docs/cli",
    ]);
  });

  it("scrolls the track sideways inside the edge-fade scroller instead of wrapping", () => {
    const nav = parse(
      renderToStaticMarkup(<DocsHomeTabs label="E" tabs={tabs} locale="en" />),
    ).querySelector("nav");
    const scroller = nav?.firstElementChild;
    expect(scroller?.classList.contains("vk-edge-fade")).toBe(true);
    expect(scroller?.querySelector("ul")?.classList.contains("vk-home-tabs-track")).toBe(true);
    const track = /\.vk-home-tabs-track \{([^}]*)\}/.exec(GLOBAL_CSS)?.[1] ?? "";
    expect(track).toContain("white-space: nowrap;");
    expect(track).toContain("width: max-content;");
  });

  it.each(["", ".de", ".es", ".fr"])("links only pages that exist, from index%s.mdx", (suffix) => {
    const source = readFileSync(join(process.cwd(), `content/docs/index${suffix}.mdx`), "utf8");
    const block = /<DocsHomeTabs\n[\s\S]*?\n\/>/.exec(source)?.[0] ?? "";
    const hrefs = [...block.matchAll(/href: "([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(hrefs).toEqual([
      "/docs/quickstart",
      "/docs/cli",
      "/docs/sdk",
      "/docs/github-action",
      "/docs/cli/mcp",
      "/docs/review-in-studio",
    ]);
    const pages = readdirSync(join(process.cwd(), "content/docs"), {
      recursive: true,
      encoding: "utf8",
    }).map((file) => `/docs/${file.replace(/\([^)]*\)\//g, "").replace(/(\/index)?\.mdx$/, "")}`);
    for (const href of hrefs) expect(pages, href).toContain(href);
  });
});

describe("DocsHomeAgentTip", () => {
  it("is a labelled aside with its title, its text and the shared prompt copy button", () => {
    const aside = parse(
      renderToStaticMarkup(
        <DocsHomeAgentTip title="Using a coding agent?">
          <p>
            Connect the <a href="/docs/cli/mcp">MCP server</a>.
          </p>
        </DocsHomeAgentTip>,
      ),
    ).querySelector("aside");
    expect(aside?.getAttribute("aria-label")).toBe("Using a coding agent?");
    expect(aside?.querySelector(".vk-home-callout-title")?.textContent).toBe(
      "Using a coding agent?",
    );
    expect(aside?.querySelector("a")?.getAttribute("href")).toBe("/docs/cli/mcp");
    const action = aside?.querySelector(".vk-agent-tip-action");
    expect(action?.classList.contains("not-prose")).toBe(true);
    expect(action?.querySelector(".vk-prompt button")?.textContent).toBe("promptCta");
    expect(action?.querySelector(".vk-prompt-text")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("keeps a hyphenated compound in a link label on one line", () => {
    const aside = parse(
      renderToStaticMarkup(
        <DocsHomeAgentTip title="T">
          <p>
            Verbinde den <a href="/de/docs/cli/mcp">MCP-Server</a> und lies{" "}
            <a href="/de/docs/start-with-ai">die ganze Anleitung</a>.
          </p>
        </DocsHomeAgentTip>,
      ),
    ).querySelector("aside");
    const [mcp, guide] = [...(aside?.querySelectorAll("a") ?? [])];
    expect(mcp?.textContent).toBe("MCP-Server");
    expect(mcp?.querySelector(".whitespace-nowrap")?.textContent).toBe("MCP-Server");
    expect(guide?.querySelector(".whitespace-nowrap")).toBeNull();
    expect(
      aside?.querySelector(".vk-home-callout-body > p:not(.vk-home-callout-title)")?.textContent,
    ).toBe("Verbinde den MCP-Server und lies die ganze Anleitung.");
  });

  it("keeps a two-word link label such as MCP server on one line", () => {
    const link = parse(
      renderToStaticMarkup(
        <DocsHomeAgentTip title="T">
          <p>
            Connect the <a href="/docs/cli/mcp">MCP server</a>.
          </p>
        </DocsHomeAgentTip>,
      ),
    ).querySelector("aside a");
    expect(link?.querySelector(".whitespace-nowrap")?.textContent).toBe("MCP server");
  });

  it.each(["", ".de", ".es", ".fr"])(
    "links the setup guide and the MCP page from the tip in index%s.mdx, since no goal card does",
    (suffix) => {
      const source = readFileSync(join(process.cwd(), `content/docs/index${suffix}.mdx`), "utf8");
      const tip = /<DocsHomeAgentTip[\s\S]*?<\/DocsHomeAgentTip>/.exec(source)?.[0] ?? "";
      const prefix = suffix === "" ? "" : `/${suffix.slice(1)}`;
      expect(tip).toContain(`](${prefix}/docs/start-with-ai)`);
      expect(tip).toContain(`](${prefix}/docs/cli/mcp)`);
      const paths = /<DocsHomePaths[\s\S]*?\n\/>/.exec(source)?.[0] ?? "";
      expect(paths).not.toContain("/docs/start-with-ai");
    },
  );

  it("sets the callout title and body at the snug and normal leading", () => {
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.>]/g, "\\$&")} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
    expect(rule(".vk-home-callout-body")).toContain("line-height: var(--leading-normal);");
    expect(rule(".vk-home-callout-body > .vk-home-callout-title")).toContain(
      "line-height: var(--leading-snug);",
    );
  });

  it("lays the button beside the text by the tip's own width, never by the viewport", () => {
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(
      ".vk-agent-tip { position: relative; z-index: 1; container: vk-agent-tip / inline-size; }",
    );
    expect(css).toContain("@container vk-agent-tip (min-width: 36rem) { .vk-agent-tip-grid {");
    expect(css).not.toMatch(/@media[^{]*\{ \.vk-agent-tip/);
  });

  it("keeps the preview inside the tip: full width while stacked, opening toward the start edge beside the text", () => {
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(".vk-agent-tip-action .vk-prompt-pop { inset-inline: 0; width: 100%; }");
    expect(css).toContain(
      ".vk-agent-tip-action .vk-prompt-pop { inset-inline: auto 0; width: min(var(--width-prompt-pop), calc(100cqw - 3rem)); }",
    );
  });
});

describe("DocsHomeNote", () => {
  it("is a ringed aside with an icon and the text it is given, and no button", () => {
    const aside = parse(
      renderToStaticMarkup(
        <DocsHomeNote>
          <p>Don't see your stack?</p>
        </DocsHomeNote>,
      ),
    ).querySelector("aside");
    expect(aside?.classList.contains("vk-home-callout")).toBe(true);
    expect(aside?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(aside?.textContent).toBe("Don't see your stack?");
    expect(aside?.querySelector("button")).toBeNull();
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
    expect(card?.classList.contains("row-span-3")).toBe(true);
    for (const child of card?.children ?? []) {
      expect(child.className, child.textContent ?? "").not.toMatch(/self-(end|center)/);
    }
  });

  it("gives every goal card the same flat panel, with no filled card standing out", async () => {
    const { DocsHomePaths } = await import("./docs-home");
    const cards = [
      ...parse(
        renderToStaticMarkup(
          <DocsHomePaths
            cards={[
              { goal: "A", page: "P", body: "B", href: "/docs/a" },
              { goal: "C", page: "P", body: "B", href: "/docs/c" },
            ]}
            locale="en"
          />,
        ),
      ).querySelectorAll("a"),
    ];
    expect(new Set(cards.map((card) => card.className)).size).toBe(1);
    expect(new Set(cards.map((card) => card.getAttribute("style"))).size).toBe(1);
    expect(cards[0]?.getAttribute("style")).not.toContain("accent-fill");
  });

  it.each(["", ".de", ".es", ".fr"])("marks no goal card primary in index%s.mdx", (suffix) => {
    const source = readFileSync(join(process.cwd(), `content/docs/index${suffix}.mdx`), "utf8");
    expect(source).not.toMatch(/\bprimary:/);
  });

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

describe("DocsHomeSteps", () => {
  it("numbers the four steps in order, each with its title and body", async () => {
    const { DocsHomeSteps } = await import("./docs-home");
    const items = [...parse(renderToStaticMarkup(<DocsHomeSteps />)).querySelectorAll("ol > li")];
    expect(items.map((item) => item.querySelector("h3")?.textContent)).toEqual([
      "1. configure.title",
      "2. diff.title",
      "3. translate.title",
      "4. verifyWrite.title",
    ]);
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "configure.body",
      "diff.body",
      "translate.body",
      "verifyWrite.body",
    ]);
  });
});

describe("DocsHomeFeatures", () => {
  const features = [
    { title: "@verbatra/cli", pkg: "cli" as const, body: "CLI.", href: "/docs/cli" },
    { title: "@verbatra/sdk", body: "SDK." },
  ];

  it("links a feature only when it has an href and a locale, prefixed with that locale", async () => {
    const { DocsHomeFeatures } = await import("./docs-home");
    const withLocale = parse(
      renderToStaticMarkup(<DocsHomeFeatures features={features} locale="fr" />),
    );
    expect([...withLocale.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/fr/docs/cli",
    ]);
    const grid = withLocale.querySelector("div.not-prose");
    expect([...(grid?.children ?? [])].map((child) => child.tagName)).toEqual(["A", "DIV"]);

    const withoutLocale = parse(renderToStaticMarkup(<DocsHomeFeatures features={features} />));
    expect(withoutLocale.querySelectorAll("a")).toHaveLength(0);
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
    expect(heading?.classList.contains("vk-h4")).toBe(true);
    expect(heading?.getAttribute("style")).toBeNull();
  });

  it("stacks its heading and its lead in one block, the lead directly under the heading", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const head = parse(
      renderToStaticMarkup(
        <DocsHomeSection title="Pick your stack" lead="Lead">
          {null}
        </DocsHomeSection>,
      ),
    ).querySelector("section > div");
    expect([...(head?.children ?? [])].map((child) => child.tagName)).toEqual(["H2", "P"]);
    for (const name of head?.classList ?? []) {
      expect(GLOBAL_CSS.includes(`.${name}`) || !name.startsWith("vk-"), name).toBe(true);
    }
    expect([...(head?.classList ?? [])].filter((name) => /grid-cols|gap-x/.test(name))).toEqual([]);
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
    const lead = parse(markup).querySelector("section > div > p");
    expect(lead?.className).not.toMatch(/justify-self-end/);
    expect(lead?.querySelector("code")?.textContent).toBe("verbatra translate");
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
