// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import {
  clickAsync,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
  typeInto,
} from "../test-support.js";
import { GlossaryPanel } from "./GlossaryPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

function glossaryOf(
  indicator: GlossaryGetResult["indicator"],
  entries: Readonly<Record<string, string>>,
): GlossaryGetResult {
  return {
    indicator,
    version: indicator.source === "none" ? null : 1,
    locales: ["de"],
    terms: Object.entries(entries).map(([source, target]) => ({
      source,
      target,
      targets: {},
      forbidden: {},
      caseSensitive: false,
      byLocale: { de: { target, inherited: true, forbidden: [] } },
    })),
    doNotTranslate: [],
    redactedTerms: [],
  };
}

function glossaryAnswer(result: GlossaryGetResult): {
  readonly ok: true;
  readonly result: GlossaryGetResult;
} {
  return { ok: true, result };
}

function stubGlossary(glossary: GlossaryGetResult): void {
  stubRpc({ "glossary.get": glossaryAnswer(glossary) });
}

const TERMS = glossaryOf(
  { source: "file", path: "glossary.json" },
  { verbatra: "Verbatra", checkout: "Kasse" },
);

const GLOSSARY = {
  ok: true,
  result: {
    indicator: { source: "none" },
    version: null,
    locales: [],
    terms: [],
    doNotTranslate: [],
    redactedTerms: [],
  },
} as const;

describe("GlossaryPanel", () => {
  it("names the page and shows the glossary once it has loaded", async () => {
    stubRpc({ "glossary.get": GLOSSARY });

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.get("h1").textContent).toBe("Glossary");
    expect(view.text()).toContain("Glossary");
    expect(view.query('[role="status"]')).toBeNull();
  });

  it("shows the structured error when the glossary cannot be read", async () => {
    stubRpc({ "glossary.get": rpcError("INTERNAL", "glossary unreadable") });

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
  });

  it("shows the glossary a term write returns", async () => {
    stubRpc({
      "glossary.get": {
        ok: true,
        result: {
          indicator: { source: "file", path: "glossary.json" },
          version: 2,
          locales: ["de"],
          terms: [],
          doNotTranslate: [],
          redactedTerms: [],
        },
      },
      "glossary.write": {
        ok: true,
        result: {
          indicator: { source: "file", path: "glossary.json" },
          version: 1,
          locales: ["de"],
          terms: [
            {
              source: "cart",
              target: "Warenkorb",
              targets: {},
              forbidden: {},
              caseSensitive: false,
              byLocale: { de: { target: "Warenkorb", inherited: true, forbidden: [] } },
            },
          ],
          doNotTranslate: [],
          redactedTerms: [],
        },
      },
    });
    const view = await renderAsync(<GlossaryPanel />);

    typeInto(view.get('input[aria-label="New glossary term"]') as HTMLInputElement, "cart");
    typeInto(
      view.get('input[aria-label="New glossary translation"]') as HTMLInputElement,
      "Warenkorb",
    );
    await clickAsync(view.getByText("button", "Add term"));

    expect(view.text()).toContain("Warenkorb");
  });

  it("drops a response that arrives after the page was left", async () => {
    let answer: (value: typeof GLOSSARY) => void = () => {};
    stubRpc({
      "glossary.get": () => new Promise<typeof GLOSSARY>((resolve) => (answer = resolve)),
    });
    const view = render(<GlossaryPanel />);

    view.unmount();
    answer(GLOSSARY);
    await Promise.resolve();

    expect(view.container.isConnected).toBe(false);
  });

  it("lists the glossary terms with their translations, direction inferred per value", async () => {
    stubGlossary(TERMS);

    const view = await renderAsync(<GlossaryPanel />);
    const terms = view.all("ul li");

    expect(terms).toHaveLength(2);
    expect(terms[1]?.textContent).toContain("checkout");
    expect(terms[1]?.textContent).toContain("Kasse");
    expect(view.all('li p > span[dir="auto"]').map((node) => node.textContent)).toEqual([
      "Verbatra",
      "Kasse",
    ]);
  });

  it("counts the glossary terms in a badge, pluralized", async () => {
    stubGlossary(TERMS);

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.text()).toContain("2 terms");
  });

  it("uses the singular term label for a one-entry glossary", async () => {
    stubGlossary(glossaryOf({ source: "inline" }, { verbatra: "Verbatra" }));

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.text()).toContain("1 term");
    expect(view.text()).not.toContain("1 terms");
  });

  it("shows an empty state and no count badge when no glossary is configured", async () => {
    stubGlossary(glossaryOf({ source: "none" }, {}));

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.text()).toContain("No glossary terms");
    expect(view.query(".bg-neutral-soft")).toBeNull();
    expect(view.query("ul li")).toBeNull();
  });

  it("names a file-backed glossary's path as its source", async () => {
    stubGlossary(TERMS);

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.text()).toContain("Source: file (glossary.json)");
  });

  it("names an inline glossary's source without a path", async () => {
    stubGlossary(glossaryOf({ source: "inline" }, { verbatra: "Verbatra" }));

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.text()).toContain("Source: inline");
  });

  it("reads the glossary once, with no parameters", async () => {
    stubGlossary(TERMS);

    await renderAsync(<GlossaryPanel />);

    expect(rpcCalls).toEqual([{ method: "glossary.get", params: {} }]);
  });
});
