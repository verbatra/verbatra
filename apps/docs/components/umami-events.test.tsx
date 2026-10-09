// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { act, type ComponentProps, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATE_CLI_COMMAND } from "@/lib/gate-demo";
import { AGENT_INIT_COMMAND, SKILLS_INSTALL_COMMAND } from "@/lib/install-commands";

const trackUmamiEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

type RichTags = Record<string, (chunks: string) => ReactNode>;

function translator(): ((key: string) => string) & {
  rich: (key: string, tags?: RichTags) => ReactNode;
} {
  return Object.assign((key: string) => key, {
    rich: (key: string, tags?: RichTags) => (tags?.releases ? tags.releases(key) : key),
  });
}

vi.mock("next-intl", () => ({ useTranslations: () => translator(), useLocale: () => "en" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => translator(),
  getLocale: async () => "en",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/studio-screenshot", () => ({
  StudioScreenshot: () => <figure data-part="studio-shot" />,
}));

vi.mock("@/components/landing/how-replay", () => ({
  HowReplay: ({ terminal }: { terminal: { headerAction?: ReactNode } }) => (
    <div data-part="how-replay">{terminal.headerAction}</div>
  ),
}));

vi.mock("fumadocs-ui/layouts/notebook/page", () => ({
  MarkdownCopyButton: ({
    markdownUrl: _url,
    ...rest
  }: ComponentProps<"button"> & { markdownUrl: string }) => (
    <button type="button" data-part="copy-markdown" {...rest} />
  ),
  ViewOptionsPopover: ({
    markdownUrl: _url,
    githubUrl: _github,
    onClick,
    ...rest
  }: ComponentProps<"button"> & { markdownUrl: string; githubUrl?: string }) => {
    const [open, setOpen] = useState(false);
    return (
      <button
        type="button"
        data-part="page-options"
        data-state={open ? "open" : "closed"}
        onClick={(event) => {
          onClick?.(event);
          setOpen((current) => !current);
        }}
        {...rest}
      />
    );
  },
}));

vi.mock("fumadocs-ui/components/codeblock", () => ({
  CodeBlock: ({
    Actions,
    children,
  }: {
    Actions: (props: { className?: string; children?: ReactNode }) => ReactNode;
    children: ReactNode;
  }) => (
    <figure>
      {Actions({ className: "actions", children: <button type="button">copy</button> })}
      <div data-part="code-area">{children}</div>
    </figure>
  ),
}));

const { TrackedAnchor, TrackedLink } = await import("./ui/tracked-link");
const { Marquee } = await import("./landing/marquee");
const { McpInstallLink } = await import("./mcp-install-link");
const { default: Button } = await import("./ui/button");
const { LandingHero } = await import("./landing-hero");
const { FinalCta } = await import("./landing/final-cta");
const { Proof } = await import("./landing/proof");
const { Loop } = await import("./landing/loop");
const { Faq } = await import("./landing/faq");
const { Evidence } = await import("./landing/evidence");
const { FullFooter } = await import("./landing/footer");
const { StartHere } = await import("./start-here");
const { DocsHomeFeatures, DocsHomePaths, DocsHomeTabs } = await import("./docs-home");
const { StackCards } = await import("./stack-cards");
const { DocsPageActions } = await import("./docs-page-actions");
const { TrackedCodeBlock } = await import("./tracked-code-block");
const { trackLocaleSwitch } = await import("./language-select");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = vi.fn<(text: string) => Promise<void>>();
let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { container, root };
  return container;
}

function staticDoc(node: ReactNode): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

async function click(target: Element | null | undefined): Promise<void> {
  if (!target) throw new Error("nothing to click");
  const stayOnPage = (event: Event) => event.preventDefault();
  window.addEventListener("click", stayOnPage);
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  window.removeEventListener("click", stayOnPage);
}

function linkByText(container: HTMLElement, text: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll("a")].find((link) => link.textContent?.includes(text));
}

class SilentObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", SilentObserver);
  trackUmamiEvent.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

describe("TrackedLink", () => {
  it("counts a click with its event name and properties and still runs the caller's handler", async () => {
    const onClick = vi.fn();
    const container = render(
      <TrackedLink
        href="/docs"
        onClick={onClick}
        track={{ name: "click-cta", data: { location: "hero", target: "docs" } }}
      >
        Docs
      </TrackedLink>,
    );
    await click(container.querySelector("a"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "hero", target: "docs" }],
    ]);
  });

  it("counts nothing without a track prop and never renders a data-umami-event attribute", async () => {
    const container = render(<TrackedLink href="/docs">Docs</TrackedLink>);
    await click(container.querySelector("a"));
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    expect(container.querySelector("[data-umami-event]")).toBeNull();
  });
});

describe("Button as a link", () => {
  it("forwards the remaining props to the link and tracks the click", async () => {
    const container = render(
      <Button
        href="/docs/quickstart"
        aria-describedby="note"
        data-part="cta"
        track={{ name: "click-cta", data: { location: "final-cta", target: "get-started" } }}
      >
        Start
      </Button>,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("aria-describedby")).toBe("note");
    expect(link?.getAttribute("data-part")).toBe("cta");
    await click(link);
    expect(trackUmamiEvent).toHaveBeenCalledWith("click-cta", {
      location: "final-cta",
      target: "get-started",
    });
  });

  it("renders a disabled link as a disabled button that counts nothing", async () => {
    const container = render(
      <Button href="/docs" disabled track={{ name: "click-cta" }}>
        Start
      </Button>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("keeps aria and data attributes on a disabled link but drops link-only props", () => {
    const button = render(
      <Button href="/docs" disabled aria-describedby="why" data-part="cta" target="_blank">
        Start
      </Button>,
    ).querySelector("button");
    expect(button?.getAttribute("aria-describedby")).toBe("why");
    expect(button?.getAttribute("data-part")).toBe("cta");
    expect(button?.hasAttribute("target")).toBe(false);
  });
});

function auxClick(target: Element | null | undefined, button: number): void {
  act(() => {
    target?.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button }));
  });
}

describe("middle-click", () => {
  it("counts a middle-click that opens a tracked link in a new tab, and ignores other buttons", () => {
    const container = render(
      <>
        <TrackedLink href="/docs" track={{ name: "click-cta", data: { target: "docs" } }}>
          Docs
        </TrackedLink>
        <TrackedAnchor href="/llms.txt" track={{ name: "click-cta", data: { target: "llms" } }}>
          llms
        </TrackedAnchor>
      </>,
    );
    const [link, anchor] = [...container.querySelectorAll("a")];
    auxClick(link, 1);
    auxClick(link, 2);
    auxClick(anchor, 1);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { target: "docs" }],
      ["click-cta", { target: "llms" }],
    ]);
  });
});

describe("Loop and marquee links", () => {
  it("counts each Loop call to action and docs link as click-cta from the loop", async () => {
    const container = render(await Loop());
    const internal = [...container.querySelectorAll("a")].filter(
      (link) => !link.getAttribute("href")?.startsWith("http"),
    );
    for (const link of internal) await click(link);
    expect(trackUmamiEvent.mock.calls.map(([, data]) => data)).toEqual(
      ["excel", "studio", "ci", "agent", "llms", "llms-full", "mcp-docs", "skills-docs"].map(
        (target) => ({ location: "loop", target }),
      ),
    );
    for (const [name] of trackUmamiEvent.mock.calls) expect(name).toBe("click-cta");
  });

  it("counts a marquee item as click-cta naming its row", async () => {
    const container = render(await Marquee());
    await click(container.querySelector('ul[aria-label="frameworksLabel"] a'));
    await click(container.querySelector('ul[aria-label="formatsLabel"] a'));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "marquee", target: "frameworks" }],
      ["click-cta", { location: "marquee", target: "formats" }],
    ]);
  });
});

describe("Landing CTAs", () => {
  it("counts the hero's Get started as click-cta from the hero", async () => {
    const container = render(await LandingHero());
    await click(linkByText(container, "ctaStart"));
    expect(trackUmamiEvent).toHaveBeenCalledWith("click-cta", {
      location: "hero",
      target: "get-started",
    });
  });

  it("counts both closing buttons as click-cta from the final CTA", async () => {
    const container = render(await FinalCta());
    await click(linkByText(container, "start"));
    await click(linkByText(container, "docs"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "final-cta", target: "get-started" }],
      ["click-cta", { location: "final-cta", target: "docs" }],
    ]);
  });
});

describe("Landing copy buttons", () => {
  it("counts the How terminal copy as copy-command from the how section", async () => {
    const container = render(await Proof());
    await click(container.querySelector('[data-part="how-replay"] button'));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["copy-command", { command: GATE_CLI_COMMAND, location: "how" }],
    ]);
  });

  it("counts every Loop command copy as copy-command from the loop", async () => {
    const container = render(await Loop());
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) await click(button);
    expect(trackUmamiEvent.mock.calls).toContainEqual([
      "copy-command",
      { command: SKILLS_INSTALL_COMMAND, location: "loop" },
    ]);
    for (const [name, data] of trackUmamiEvent.mock.calls) {
      expect(name).toBe("copy-command");
      expect(data).toMatchObject({ location: "loop" });
    }
  });
});

describe("FAQ", () => {
  const ITEMS = [
    { id: "formats", question: "Which formats?", answer: "Many." },
    { id: "cost", question: "What does it cost?", answer: "Nothing." },
  ];

  it("counts opening a question by its key, never its text, and nothing when it closes", async () => {
    const container = render(<Faq items={ITEMS} />);
    const question = container.querySelectorAll("h3 button")[1];
    await click(question);
    await click(question);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["open-faq", { question: "cost", location: "faq" }],
    ]);
  });

  it("counts the releases link as an outbound link from the FAQ", () => {
    const link = staticDoc(<Faq items={ITEMS} />).querySelector<HTMLAnchorElement>(
      'a[target="_blank"]',
    );
    expect(link?.dataset.umamiEvent).toBe("outbound-link");
    expect(link?.dataset.umamiEventTarget).toBe("releases");
    expect(link?.dataset.umamiEventLocation).toBe("faq");
  });
});

describe("Evidence links", () => {
  it("counts an external evidence link as an outbound link from the control section", () => {
    const link = staticDoc(
      <Evidence text="ci.yml" href="https://github.com/verbatra/verbatra" />,
    ).querySelector<HTMLAnchorElement>("a");
    expect(link?.dataset.umamiEvent).toBe("outbound-link");
    expect(link?.dataset.umamiEventTarget).toBe("evidence");
    expect(link?.dataset.umamiEventLocation).toBe("control");
  });

  it("leaves an internal evidence link untracked", () => {
    const link = staticDoc(<Evidence text="lock" href="/docs/lock-file" />).querySelector("a");
    expect(link?.hasAttribute("data-umami-event")).toBe(false);
  });
});

describe("Footer", () => {
  it("names the footer as the location of every outbound link", async () => {
    const doc = staticDoc(await FullFooter());
    const links = [
      ...doc.querySelectorAll<HTMLAnchorElement>('a[data-umami-event="outbound-link"]'),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.dataset.umamiEventLocation).toBe("footer");
  });
});

describe("StartHere", () => {
  it("counts the agent command copy as copy-command and the prompt copy as copy-ai-prompt from start-here", async () => {
    const container = render(<StartHere />);
    const [command, prompt] = [...container.querySelectorAll("button")];
    await click(command);
    await click(prompt);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["copy-command", { command: AGENT_INIT_COMMAND, location: "start-here" }],
      ["copy-ai-prompt", { location: "start-here" }],
    ]);
  });
});

describe("Docs home", () => {
  it("counts an entry tab as click-cta from the docs home", async () => {
    const container = render(
      <DocsHomeTabs label="Entry" tabs={[{ label: "CLI", href: "/docs/cli" }]} locale="en" />,
    );
    await click(container.querySelector("a"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "docs-home", target: "/docs/cli" }],
    ]);
  });

  it("counts a goal path card as click-cta from the docs home", async () => {
    const container = render(
      <DocsHomePaths
        cards={[{ href: "/docs/quickstart", goal: "Start", page: "Quickstart", body: "b" }]}
        locale="en"
      />,
    );
    await click(container.querySelector("a"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "docs-home", target: "/docs/quickstart" }],
    ]);
  });

  it("counts a linked feature card as click-cta from the docs home", async () => {
    const container = render(
      <DocsHomeFeatures
        features={[{ title: "Studio", body: "b", href: "/docs/cli/studio" }]}
        locale="en"
      />,
    );
    await click(container.querySelector("a"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "docs-home", target: "/docs/cli/studio" }],
    ]);
  });

  it("counts a stack card as click-cta from wherever it is placed", async () => {
    const card = {
      label: "React",
      href: "/docs/quickstart/react",
      icon: "react",
      formats: [],
    } as const;
    const container = render(
      <>
        <StackCards labelledBy="home" cards={[card]} locale="en" location="docs-home" />
        <StackCards labelledBy="page" cards={[card]} locale="en" />
      </>,
    );
    const [home, page] = [...container.querySelectorAll("a")];
    await click(home);
    await click(page);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["click-cta", { location: "docs-home", target: "/docs/quickstart/react" }],
      ["click-cta", { location: "docs-page", target: "/docs/quickstart/react" }],
    ]);
  });
});

describe("Docs page", () => {
  it("names the Markdown copy on its own button", () => {
    const doc = staticDoc(<DocsPageActions markdownUrl="/docs/cli.md" githubUrl="https://x" />);
    const copy = doc.querySelector<HTMLElement>('[data-part="copy-markdown"]');
    expect([copy?.dataset.umamiEvent, copy?.dataset.umamiEventLocation]).toEqual([
      "copy-page-markdown",
      "docs-page",
    ]);
  });

  it("counts the page options only when the popover opens, never when it closes", async () => {
    const container = render(<DocsPageActions markdownUrl="/docs/cli.md" />);
    const options = container.querySelector('[data-part="page-options"]');
    expect(options?.hasAttribute("data-umami-event")).toBe(false);
    await click(options);
    await click(options);
    await click(options);
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["open-page-options", { location: "docs-page" }],
      ["open-page-options", { location: "docs-page" }],
    ]);
  });

  it("counts a code block copy as copy-code, and nothing for a click on the code itself", async () => {
    const container = render(
      <TrackedCodeBlock>
        <pre>npx @verbatra/cli check</pre>
      </TrackedCodeBlock>,
    );
    await click(container.querySelector('[data-part="code-area"] pre'));
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    await click(container.querySelector(".actions button"));
    expect(trackUmamiEvent.mock.calls).toEqual([["copy-code", { location: "docs-page" }]]);
  });
});

describe("Language switch", () => {
  it("counts locale-switch only when the locale actually changes", () => {
    trackLocaleSwitch("en", "en");
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    trackLocaleSwitch("en", "de");
    expect(trackUmamiEvent.mock.calls).toEqual([["locale-switch", { to: "de", from: "en" }]]);
  });
});

const LINK_SOURCES = new Set([
  "next/link",
  "fumadocs-core/link",
  "fumadocs-ui/layouts/shared",
  "@/components/ui/tracked-link",
  "@/components/ui/button",
]);

const LINK_ONLY_WITH_HREF = new Set(["Button"]);

function linkNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import\s+(?:(\w+)|\{([^}]*)\})\s+from\s+"([^"]+)"/g)) {
    if (!LINK_SOURCES.has(match[3] ?? "")) continue;
    if (match[1]) names.push(match[1]);
    for (const named of (match[2] ?? "").split(",")) {
      const name = named
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (name && /^\w+$/.test(name)) names.push(name);
    }
  }
  return names;
}

function balanced(source: string, start: number, stopAtTagEnd: boolean): string {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (!stopAtTagEnd && depth === 0) return source.slice(start, index + 1);
    }
    if (stopAtTagEnd && char === ">" && depth === 0 && source[index - 1] !== "=") {
      return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function definitionOf(source: string, name: string): string {
  const declaration = new RegExp(`(?:function|const|let)\\s+${name}\\b`).exec(source);
  if (!declaration) return "";
  const body = source.indexOf("{", declaration.index);
  return body < 0 ? "" : balanced(source, body, false);
}

function spreadsEvent(source: string, tag: string): boolean {
  return [...tag.matchAll(/\{\.\.\.([^}]*)\}/g)].some((spread) =>
    [...(spread[1] ?? "").matchAll(/[A-Za-z_]\w*/g)].some((identifier) =>
      definitionOf(source, identifier[0]).includes("data-umami-event"),
    ),
  );
}

function isLinkTag(name: string, tag: string): boolean {
  return !LINK_ONLY_WITH_HREF.has(name) || /\shref=/.test(tag);
}

function declarativeEventsOnLinks(source: string): string[] {
  return linkNames(source).flatMap((name) =>
    [...source.matchAll(new RegExp(`<${name}[\\s>]`, "g"))]
      .map((match) => balanced(source, match.index, true))
      .filter((tag) => isLinkTag(name, tag))
      .filter((tag) => tag.includes("data-umami-event") || spreadsEvent(source, tag)),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

function internalTrackedAnchors(doc: Document): string[] {
  return [...doc.querySelectorAll<HTMLAnchorElement>("a[data-umami-event]")]
    .filter((link) => link.getAttribute("target") !== "_blank")
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => /^(?:\/|#|\.|\?)/.test(href));
}

describe("internal links never carry a declarative Umami event", () => {
  it("flags a literal attribute, a spread helper, a Button link and a LinkItem", () => {
    const link = `import Link from "next/link";\n`;
    expect(
      declarativeEventsOnLinks(`${link}const a = <Link href="/x" data-umami-event="c">x</Link>;`),
    ).toHaveLength(1);
    expect(
      declarativeEventsOnLinks(
        `${link}function cta(t: string) {\n  return { "data-umami-event": "c", t };\n}\nconst a = <Link href="/x" {...cta("y")}>x</Link>;`,
      ),
    ).toHaveLength(1);
    expect(
      declarativeEventsOnLinks(
        `import Button from "@/components/ui/button";\nconst a = <Button href="/x" data-umami-event="c">x</Button>;`,
      ),
    ).toHaveLength(1);
    expect(
      declarativeEventsOnLinks(
        `import { LinkItem } from "fumadocs-ui/layouts/shared";\nconst a = <LinkItem item={i} data-umami-event="c" />;`,
      ),
    ).toHaveLength(1);
  });

  it("lets through onClick tracking and a native Button that carries an event", () => {
    const fine = `import Link from "next/link";\nimport Button from "@/components/ui/button";\nconst a = <Link href="/x" onClick={() => track()} {...rest}>x</Link>;\nconst b = <Button data-umami-event="c">x</Button>;`;
    expect(declarativeEventsOnLinks(fine)).toEqual([]);
  });

  it("finds none in the docs app source, because the tracker would turn the navigation into a full reload", () => {
    const root = process.cwd();
    const files = ["app", "components", "lib"].flatMap((dir) => sourceFiles(join(root, dir)));
    const scanned = files.filter((file) => linkNames(readFileSync(file, "utf8")).length > 0);
    expect(scanned.length).toBeGreaterThan(5);
    const offenders = scanned.flatMap((file) =>
      declarativeEventsOnLinks(readFileSync(file, "utf8")).map(
        (tag) => `${relative(root, file)}: ${tag}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("flags a rendered same-tab internal anchor with an event, and ignores external and new-tab ones", () => {
    const doc = staticDoc(
      <>
        <a href="/docs" data-umami-event="click-cta">
          a
        </a>
        <a href="#faq" data-umami-event="click-cta">
          b
        </a>
        <a href="https://example.com" data-umami-event="outbound-link">
          c
        </a>
        <a href="/llms.txt" target="_blank" rel="noreferrer" data-umami-event="click-cta">
          d
        </a>
        <a href="/docs">e</a>
      </>,
    );
    expect(internalTrackedAnchors(doc)).toEqual(["/docs", "#faq"]);
  });

  it("finds none in the rendered landing, docs home and docs page surfaces", async () => {
    const card = {
      label: "React",
      href: "/docs/quickstart/react",
      icon: "react",
      formats: [],
    } as const;
    const doc = staticDoc(
      <>
        {await LandingHero()}
        {await Marquee()}
        {await Proof()}
        {await Loop()}
        <Faq items={[{ id: "cost", question: "Cost?", answer: "None." }]} />
        {await FinalCta()}
        {await FullFooter()}
        <StartHere />
        <DocsHomeTabs label="Entry" tabs={[{ label: "CLI", href: "/docs/cli" }]} locale="en" />
        <DocsHomePaths
          cards={[{ href: "/docs/quickstart", goal: "Start", page: "Quickstart", body: "b" }]}
          locale="en"
        />
        <DocsHomeFeatures
          features={[{ title: "Studio", body: "b", href: "/docs/x" }]}
          locale="en"
        />
        <StackCards labelledBy="home" cards={[card]} locale="en" location="docs-home" />
        <McpInstallLink client="vscode" />
        <Button href="/docs/quickstart" track={{ name: "click-cta" }}>
          Start
        </Button>
      </>,
    );
    expect(doc.querySelectorAll("a").length).toBeGreaterThan(40);
    expect(internalTrackedAnchors(doc)).toEqual([]);
  });
});
