// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig, scaffoldingMetadata, translate } from "@verbatra/sdk";
import { act, type ReactNode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { i18n, localizedPath } from "@/lib/i18n";
import { STUDIO_RUN_COMMAND } from "@/lib/install-commands";
import { CHECKOUT_ACTION_REF, VERBATRA_ACTION_REF } from "@/lib/landing-code";
import {
  FLOW_ACTION_CODE,
  FLOW_CHECK_CODE,
  FLOW_CHECK_EXIT_CODES,
  FLOW_CLI_CODE,
  FLOW_DEMO_NODE,
  FLOW_MCP_CODE,
  FLOW_NODES,
  FLOW_SDK_CODE,
} from "@/lib/landing-flow";
import { PACKAGE_VERSION } from "@/lib/site";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import { contrast, themeTokens } from "@/test-support/contrast";
import { preloadRegisteredIslands } from "@/test-support/islands";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = vi.hoisted(() => ({ locale: "en" }));

const draw = vi.hoisted(() => ({ loads: 0, mounts: 0 }));

const gsapCalls = vi.hoisted(() => ({
  queries: [] as string[],
  tweens: [] as Array<{ target: unknown; from: unknown; to: Record<string, unknown> }>,
  reverts: 0,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const catalogs = {
    en: (await import("@/messages/en.json")).default,
    de: (await import("@/messages/de.json")).default,
    es: (await import("@/messages/es.json")).default,
    fr: (await import("@/messages/fr.json")).default,
  };
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: page.locale,
        messages: catalogs[page.locale as keyof typeof catalogs],
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => page.locale,
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: catalog } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages: catalog, namespace: namespace as never }),
  };
});

vi.mock("./flow-draw", () => {
  draw.loads += 1;
  return {
    FlowDraw: () => {
      draw.mounts += 1;
      return null;
    },
  };
});

vi.mock("@/lib/gsap-draw", () => {
  const gsap = {
    matchMedia: () => {
      const cleanups: Array<() => void> = [];
      return {
        add: (query: string, setup: () => (() => void) | undefined) => {
          gsapCalls.queries.push(query);
          const cleanup = setup();
          if (cleanup) cleanups.push(cleanup);
        },
        revert: () => {
          gsapCalls.reverts += 1;
          for (const cleanup of cleanups.splice(0)) cleanup();
        },
      };
    },
    fromTo: (target: unknown, from: unknown, to: Record<string, unknown>) => {
      gsapCalls.tweens.push({ target, from, to });
    },
  };
  return {
    gsap,
    ScrollTrigger: { refresh: () => undefined },
    useGSAP: (setup: () => (() => void) | undefined) => {
      useLayoutEffect(() => setup(), [setup]);
    },
  };
});

const { Flow } = await import("./flow");
const { FlowMotion } = await import("./flow-motion");
const { FLOW_DRAW_END, FLOW_DRAW_START, FLOW_DRAWING, FLOW_MOTION_QUERY, FlowDraw } =
  await vi.importActual<typeof import("./flow-draw")>("./flow-draw");

await preloadRegisteredIslands();

const DOCS = process.cwd();
const REPO = join(DOCS, "../..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

async function renderServer(locale = "en"): Promise<HTMLElement> {
  page.locale = locale;
  const container = document.createElement("div");
  container.innerHTML = renderToString(await Flow());
  return container;
}

function nodes(root: ParentNode): HTMLLIElement[] {
  return [...root.querySelectorAll<HTMLLIElement>("ol.vk-flow-list > li")];
}

function fenceAfter(markdown: string, heading: string, lang: string): string {
  const from = markdown.indexOf(heading);
  if (from === -1) throw new Error(`no ${heading}`);
  const open = markdown.indexOf(`\`\`\`${lang}`, from);
  const start = markdown.indexOf("\n", open) + 1;
  return markdown.slice(start, markdown.indexOf("```", start));
}

const PUBLISHED_CLI: {
  readonly version: string;
  readonly commands: Readonly<Record<string, ReadonlyArray<string>>>;
} = JSON.parse(read(join(DOCS, "test-support/cli-0.11.1-flags.json")));

const GEMINI_KEY = scaffoldingMetadata.providerEnv.gemini;

function publishedFlags(command: string): ReadonlyMap<string, boolean> {
  return new Map(
    (PUBLISHED_CLI.commands[command] ?? []).map((spec) => {
      const [flag = "", value] = spec.split(" ");
      return [flag, value !== undefined];
    }),
  );
}

function cliWords(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

function docsRoutes(): ReadonlySet<string> {
  const root = join(DOCS, "content/docs");
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^[^.]+\.mdx$/.test(entry.name)) {
        const route = relative(root, path)
          .replace(/\.mdx$/, "")
          .split("/")
          .filter((part) => !part.startsWith("("))
          .join("/");
        routes.add(`/docs/${route}`.replace(/\/index$/, ""));
      }
    }
  };
  walk(root);
  return routes;
}

describe("the feature flow section", () => {
  it("is one ordered list with one node per flow entry, each an h3, two sentences, one snippet and one docs link", async () => {
    for (const locale of i18n.languages) {
      const root = await renderServer(locale);
      const section = root.querySelector("section#flow");
      expect(section?.querySelector("h2#flow-heading")).not.toBeNull();
      expect(section?.querySelectorAll("ol")).toHaveLength(1);
      const items = nodes(root);
      expect(items.map((item) => item.dataset.flowNode)).toEqual(FLOW_NODES.map((node) => node.id));
      for (const item of items) {
        const where = `${locale} ${item.dataset.flowNode}`;
        expect(item.querySelectorAll("h3"), where).toHaveLength(1);
        expect(item.querySelectorAll(".vk-flow-snippet figure[data-code-lang]")).toHaveLength(1);
        expect(item.querySelectorAll("a[href]"), where).toHaveLength(1);
        const body = item.querySelector(".vk-flow-body")?.textContent ?? "";
        expect(body.split(/(?<=[.!?])\s+(?=\S)/u), where).toHaveLength(2);
      }
    }
  });

  it("links every node to a docs page that exists, in the page's locale", async () => {
    const routes = docsRoutes();
    for (const locale of i18n.languages) {
      const items = nodes(await renderServer(locale));
      FLOW_NODES.forEach((node, index) => {
        expect(routes.has(node.docsPath), node.docsPath).toBe(true);
        expect(items[index]?.querySelector("a")?.getAttribute("href")).toBe(
          localizedPath(locale, node.docsPath),
        );
      });
    }
  });

  it("renders each snippet's text exactly", async () => {
    const items = nodes(await renderServer());
    FLOW_NODES.forEach((node, index) => {
      const pre = items[index]?.querySelector(".vk-flow-snippet pre");
      expect(pre?.textContent, node.id).toBe(node.snippet.code.replace(/\n+$/, ""));
      const caption = items[index]?.querySelector(".vk-flow-snippet figcaption");
      expect(caption?.textContent ?? undefined).toBe(node.snippet.filename);
    });
  });

  it("puts the offline Try it playground in the incremental node, revealed as one block", async () => {
    const items = nodes(await renderServer());
    const withDemo = items.filter((item) => item.querySelector(".vk-showcase-try") !== null);
    expect(withDemo.map((item) => item.dataset.flowNode)).toEqual([FLOW_DEMO_NODE]);
    const panel = withDemo[0]?.querySelector(".vk-showcase");
    expect(panel?.getAttribute("data-reveal")).toBe("2");
    expect(withDemo[0]?.querySelector(".vk-flow-demo-lead")?.textContent).toBeTruthy();
  });

  it("draws the rail as decoration that assistive technology never reaches", async () => {
    const root = await renderServer();
    const rail = root.querySelector(".vk-flow-rail");
    expect(rail?.getAttribute("aria-hidden")).toBe("true");
    const svg = rail?.querySelector(":scope > svg");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.querySelectorAll("path")).toHaveLength(2);
    for (const mark of root.querySelectorAll(".vk-flow-mark")) {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("serves the drawn state: the path is whole and every mark filled without JavaScript", async () => {
    const root = await renderServer();
    expect(root.querySelector("[data-flow]")).toBeNull();
    expect(root.querySelector("[data-revealed]")).toBeNull();
    expect(root.querySelector(".vk-flow-path")?.getAttribute("style")).toBeNull();
    const rules = docsStylesheetRules();
    const path = rulesFor(rules, ".vk-flow-path");
    expect(path.every((rule) => !("stroke-dasharray" in rule.declarations))).toBe(true);
    const hidden = rules.filter((rule) =>
      rule.selector.includes(".vk-flow-mark:not([data-revealed])"),
    );
    expect(hidden.length).toBeGreaterThan(0);
    for (const rule of hidden) expect(rule.selector).toContain('[data-flow="drawing"]');
    expect(FLOW_DRAWING).toBe("drawing");
  });

  it("keeps the mark numbers readable, filled and hollow, in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const tokens = themeTokens()[theme];
      expect(contrast(tokens, "--accent-fill-fg", "--accent-fill")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens, "--text-muted", "--surface-band")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dates nothing itself: no release badge and no literal version in the section", async () => {
    for (const locale of i18n.languages) {
      expect((await renderServer(locale)).querySelector(".vk-available-from")).toBeNull();
    }
    for (const file of ["components/landing/flow.tsx", "lib/landing-flow.ts"]) {
      const source = read(join(DOCS, file));
      expect(source, file).not.toMatch(/\d+\.\d+\.\d+/);
      expect(source, file).not.toMatch(/AvailableFrom/);
    }
  });

  it("names the check exit codes in every locale, in source order", async () => {
    for (const locale of i18n.languages) {
      const items = nodes(await renderServer(locale));
      const check = items.find((item) => item.dataset.flowNode === "check");
      const digits = [
        ...(check?.querySelector(".vk-flow-body")?.textContent ?? "").matchAll(/\d/g),
      ];
      expect(
        digits.map(([digit]) => Number(digit)),
        locale,
      ).toEqual([
        FLOW_CHECK_EXIT_CODES.fail,
        FLOW_CHECK_EXIT_CODES.ok,
        FLOW_CHECK_EXIT_CODES.usage,
      ]);
    }
  });
});

describe("the flow snippets equal their sources", () => {
  it("shows the next-intl source file the real adapter writes", () => {
    const node = FLOW_NODES.find((entry) => entry.id === "source");
    expect(node?.snippet.code).toBe(FORMAT_SAMPLES["next-intl-json"].text);
    expect(node?.snippet.filename).toBe("messages/en.json");
  });

  it("runs only commands and flags the published @verbatra/cli registers, each value flag with its value", () => {
    expect(PUBLISHED_CLI.version).toBe("0.11.1");
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const lines = [FLOW_CLI_CODE, FLOW_CHECK_CODE].flatMap((code) => code.trimEnd().split("\n"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const [runner, pkg, command = "", ...args] = cliWords(line);
      expect(`${runner} ${pkg}`).toBe("npx @verbatra/cli");
      const published = publishedFlags(command);
      expect(published.size, command).toBeGreaterThan(0);
      expect(run).toContain(`.command("${command}")`);
      args.forEach((arg, index) => {
        if (!arg.startsWith("--")) {
          expect(published.get(args[index - 1] ?? ""), `${command} ${arg}`).toBe(true);
          return;
        }
        expect(published.has(arg), `${command} ${arg}`).toBe(true);
        const takesValue = published.get(arg) === true;
        const next = args[index + 1];
        expect(next !== undefined && !next.startsWith("--"), `${command} ${arg}`).toBe(takesValue);
        expect(run).toMatch(new RegExp(`"${arg}( <[a-z]+>)?"`));
      });
    }
  });

  it("points init at the file node 1 shows, so the two nodes work together", () => {
    const init = FLOW_CLI_CODE.split("\n")
      .map(cliWords)
      .find((words) => words[2] === "init");
    const pattern = init?.[(init?.indexOf("--path") ?? -2) + 1];
    expect(pattern).toContain("{locale}");
    const source = FLOW_NODES.find((entry) => entry.id === "source");
    expect(pattern?.replace("{locale}", "en")).toBe(source?.snippet.filename);
    expect(init).not.toContain("--source");
  });

  it("calls the SDK the way the SDK quickstart does", () => {
    const quickstart = fenceAfter(
      read(join(DOCS, "content/docs/(sdk)/sdk-quickstart.mdx")),
      "### Translate and read the summary",
      "ts",
    );
    const [importLine, , configLine, translateLine] = FLOW_SDK_CODE.split("\n");
    expect(quickstart.split("\n")[0]).toBe(importLine);
    expect(quickstart).toContain(`${configLine}\n`);
    expect(translateLine).toBe("const summary = await translate({ config });");
    expect(quickstart).toContain("const summary = await translate({\n  config,");
    expect(typeof loadConfig).toBe("function");
    expect(typeof translate).toBe("function");
  });

  it("copies the GitHub Action workflow from its guide, pinned to SHAs and the published version, with the key of the provider node 2 sets up", () => {
    const guide = fenceAfter(
      read(join(DOCS, "content/docs/(guides)/github-action.mdx")),
      "## Add the action to a workflow",
      "yaml",
    );
    const guideKey = "ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}";
    expect(guide).toContain(guideKey);
    const expected = guide
      .replace(guideKey, `${GEMINI_KEY}: \${{ secrets.${GEMINI_KEY} }}`)
      .replace("actions/checkout@<commit-sha>", CHECKOUT_ACTION_REF)
      .replace("verbatra/action@<commit-sha> # a commit on the v1 line", VERBATRA_ACTION_REF)
      .replace(/version: \S+ # .*\n/, `version: ${PACKAGE_VERSION}\n`);
    expect(FLOW_ACTION_CODE).toBe(expected);
    expect(FLOW_ACTION_CODE).not.toContain("<commit-sha>");
  });

  it("pins the check exit codes to the CLI", () => {
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const body = run.slice(run.indexOf("function checkExitCode("));
    const ternary = /\? (\d) : (\d);\n\}/.exec(body);
    expect(ternary?.slice(1).map(Number)).toEqual([
      FLOW_CHECK_EXIT_CODES.ok,
      FLOW_CHECK_EXIT_CODES.fail,
    ]);
    const exit2 = run.slice(run.indexOf("function renderFailureExit2("));
    expect(exit2.slice(0, exit2.indexOf("\n}"))).toContain(
      `return ${FLOW_CHECK_EXIT_CODES.usage};`,
    );
    expect(FLOW_CHECK_CODE).toBe("npx @verbatra/cli check\n");
  });

  it("runs Studio with the command the rest of the site uses", () => {
    const node = FLOW_NODES.find((entry) => entry.id === "studio");
    expect(node?.snippet.code).toBe(`${STUDIO_RUN_COMMAND}\n`);
  });

  it("copies the Claude Code .mcp.json block from the MCP client guide", () => {
    const guide = fenceAfter(
      read(join(DOCS, "content/docs/(agents)/connect-an-mcp-client.mdx")),
      "## Claude Code",
      "json",
    );
    expect(FLOW_MCP_CODE).toBe(guide);
  });
});

describe("the flow motion island", () => {
  let reduced = false;
  let observed: Array<(entries: Array<Partial<IntersectionObserverEntry>>) => void> = [];
  const mounted: Array<{ root: Root; host: HTMLElement }> = [];

  beforeEach(() => {
    reduced = false;
    observed = [];
    draw.mounts = 0;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("reduce") ? reduced : !reduced,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<Partial<IntersectionObserverEntry>>) => void) {
          observed.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
    vi.unstubAllGlobals();
  });

  async function mount(): Promise<HTMLElement> {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    await act(async () => root.render(<FlowMotion>content</FlowMotion>));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return host;
  }

  it("loads the drawing code only once the flow nears the viewport", async () => {
    await mount();
    expect(draw.mounts).toBe(0);
    expect(observed).toHaveLength(1);
    await act(async () => {
      observed[0]?.([{ isIntersecting: false }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(draw.mounts).toBe(0);
    await act(async () => {
      observed[0]?.([{ isIntersecting: true }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(draw.loads).toBe(1);
    expect(draw.mounts).toBeGreaterThan(0);
  });

  it("never loads it under reduced motion", async () => {
    reduced = true;
    await mount();
    expect(observed).toHaveLength(0);
    expect(draw.mounts).toBe(0);
  });

  it("reaches the drawing code only through a dynamic import, and GSAP only through it", () => {
    const motion = read(join(DOCS, "components/landing/flow-motion.tsx"));
    expect(motion).toContain('import("./flow-draw")');
    expect(motion).not.toMatch(/from "(\.\/flow-draw|gsap|@gsap\/react|@\/lib\/gsap[^"]*)"/);
    expect(read(join(DOCS, "components/landing/flow-draw.tsx"))).toContain(
      'from "@/lib/gsap-draw"',
    );
    expect(read(join(DOCS, "lib/gsap-draw.ts"))).not.toContain("ScrambleText");
    expect(read(join(DOCS, "components/landing/flow.tsx"))).not.toMatch(/gsap|flow-draw/);
  });
});

describe("the flow drawing", () => {
  const mounted: Array<{ root: Root; host: HTMLElement }> = [];

  beforeEach(() => {
    gsapCalls.queries.length = 0;
    gsapCalls.tweens.length = 0;
    gsapCalls.reverts = 0;
  });

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
  });

  it("scrubs the path with the scroll, from 80 percent down to 60 percent, only without reduced motion, and leaves the drawn state when it unmounts", async () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="vk-flow"><svg class="vk-flow-rail"><path class="vk-flow-path"></path></svg><ol class="vk-flow-list"><li><span class="vk-flow-mark"></span></li></ol></div>';
    document.body.append(host);
    const scope = { current: host.querySelector<HTMLElement>(".vk-flow") };
    const root = createRoot(document.createElement("div"));
    mounted.push({ root, host });
    await act(async () => root.render(<FlowDraw scope={scope} />));

    expect(gsapCalls.queries).toEqual([FLOW_MOTION_QUERY]);
    expect(FLOW_MOTION_QUERY).toBe("(prefers-reduced-motion: no-preference)");
    expect(scope.current?.dataset.flow).toBe(FLOW_DRAWING);
    const tween = gsapCalls.tweens[0];
    expect(tween?.target).toBe(host.querySelector(".vk-flow-path"));
    expect(tween?.from).toEqual({ drawSVG: "0%" });
    expect(tween?.to).toMatchObject({
      drawSVG: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: host.querySelector(".vk-flow-list"),
        start: FLOW_DRAW_START,
        end: FLOW_DRAW_END,
        scrub: true,
      },
    });
    expect([FLOW_DRAW_START, FLOW_DRAW_END]).toEqual(["top 80%", "bottom 60%"]);
    expect(JSON.stringify(tween?.to)).not.toContain("pin");

    act(() => root.unmount());
    mounted.length = 0;
    host.remove();
    expect(gsapCalls.reverts).toBe(1);
    expect(scope.current?.dataset.flow).toBeUndefined();
  });
});
