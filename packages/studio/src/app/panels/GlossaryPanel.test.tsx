// @vitest-environment jsdom
import { act, Profiler, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import {
  buttonNamed,
  clickAsync,
  deferredAnswer,
  flush,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
  textboxNamed,
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

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get("h1").textContent).toBe("Glossary");
    expect(view.text()).toContain("Glossary");
    expect(view.query('[role="status"]')).toBeNull();
  });

  it("shows the structured error when the glossary cannot be read", async () => {
    stubRpc({ "glossary.get": rpcError("INTERNAL", "glossary unreadable") });

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

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
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    typeInto(view.get('input[aria-label="New glossary term"]') as HTMLInputElement, "cart");
    typeInto(
      view.get('input[aria-label="New glossary translation"]') as HTMLInputElement,
      "Warenkorb",
    );
    await clickAsync(view.getByText("button", "Add term"));

    expect(view.text()).toContain("Warenkorb");
    expect(view.get("header").textContent).toContain("1 term");
  });

  it("drops a response that arrives after the page was left", async () => {
    let answer: (value: typeof GLOSSARY) => void = () => {};
    stubRpc({
      "glossary.get": () => new Promise<typeof GLOSSARY>((resolve) => (answer = resolve)),
    });
    const view = render(<GlossaryPanel refreshToken={0} />);

    view.unmount();
    answer(GLOSSARY);
    await Promise.resolve();

    expect(view.container.isConnected).toBe(false);
  });

  it("lists the glossary terms with their translations, direction inferred per value", async () => {
    stubGlossary(TERMS);

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
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

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get("header").textContent).toContain("2 terms");
  });

  it("uses the singular term label for a one-entry glossary", async () => {
    stubGlossary(glossaryOf({ source: "inline" }, { verbatra: "Verbatra" }));

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get("header").textContent).toContain("1 term");
    expect(view.get("header").textContent).not.toContain("1 terms");
  });

  it("shows an empty state and no count badge when no glossary is configured", async () => {
    stubGlossary(glossaryOf({ source: "none" }, {}));

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.text()).toContain("No glossary terms");
    expect(view.get("header").textContent).not.toMatch(/\d+ terms?/);
    expect(view.query("ul li")).toBeNull();
  });

  it("names a file-backed glossary's path as its source", async () => {
    stubGlossary(TERMS);

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get("header").textContent).toContain("Source: file (glossary.json)");
  });

  it("names an inline glossary's source without a path", async () => {
    stubGlossary(glossaryOf({ source: "inline" }, { verbatra: "Verbatra" }));

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get("header").textContent).toContain("Source: inline");
  });

  it("reads the glossary once, with no parameters", async () => {
    stubGlossary(TERMS);

    await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(rpcCalls).toEqual([{ method: "glossary.get", params: {} }]);
  });
});

describe("GlossaryPanel, loading and recovering", () => {
  it("shows a skeleton of the list while the first read is open", () => {
    stubRpc({ "glossary.get": () => new Promise(() => {}) });

    const view = render(<GlossaryPanel refreshToken={0} />);

    const status = view.get('[role="status"]');
    expect(status.textContent?.trim()).toBe("Loading the glossary");
    expect(status.getAttribute("data-skeleton")).toBe("list");
  });

  it("offers Retry for a failed read, and a successful Retry moves focus to the glossary", async () => {
    let calls = 0;
    stubRpc({
      "glossary.get": () =>
        calls++ === 0 ? rpcError("INTERNAL", "unreadable") : glossaryAnswer(TERMS),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    const retry = buttonNamed(view, "Retry");
    retry.focus();

    await clickAsync(retry);

    expect(rpcCalls).toHaveLength(2);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.text()).toContain("Verbatra");
    expect(document.activeElement).toBe(view.get("[data-recovery-target]"));
  });

  it("keeps Retry where it is, inert while running, when the repeat fails again", async () => {
    stubRpc({ "glossary.get": rpcError("INTERNAL", "unreadable") });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    const retry = buttonNamed(view, "Retry");
    retry.focus();

    await clickAsync(retry);

    expect(rpcCalls).toHaveLength(2);
    expect(document.activeElement).toBe(buttonNamed(view, "Retry"));
  });

  it("states a corrupt glossary file in the server's own words", async () => {
    stubRpc({ "glossary.get": rpcError("CONFIG_INVALID", "glossary.json is not valid JSON") });

    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    expect(view.get('[role="alert"]').textContent).toContain("glossary.json is not valid JSON");
    expect(view.query("[data-recovery-target]")).toBeNull();
  });
});

describe("GlossaryPanel, live refresh", () => {
  it("re-reads when the refresh token changes, without a skeleton or a focus move", async () => {
    let version = 0;
    stubRpc({
      "glossary.get": () =>
        glossaryAnswer(
          version++ === 0
            ? TERMS
            : glossaryOf({ source: "file", path: "glossary.json" }, { verbatra: "Neu" }),
        ),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    const search = textboxNamed(view, "Search terms");
    search.focus();

    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    expect(rpcCalls).toHaveLength(2);
    expect(view.text()).toContain("Neu");
    expect(view.query("[data-skeleton]")).toBeNull();
    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
  });

  const FILE = { source: "file", path: "glossary.json" } as const;

  it("applies a different read at once: other rows update, an edited row keeps its draft", async () => {
    let served = TERMS;
    stubRpc({ "glossary.get": () => glossaryAnswer(served) });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Draft");

    served = glossaryOf(FILE, { verbatra: "Outside", checkout: "Kasse neu" });
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Draft");
    expect(view.text()).toContain("Kasse neu");
    expect(view.text()).not.toContain("A refresh is waiting");
    expect(rpcCalls.filter((call) => call.method === "glossary.get")).toHaveLength(2);
  });

  it("renders nothing again when an identical read arrives, as after a Studio save", async () => {
    stubGlossary(TERMS);
    let commits = 0;
    const tree = (token: number): ReactNode => (
      <Profiler id="panel" onRender={() => (commits += 1)}>
        <GlossaryPanel refreshToken={token} />
      </Profiler>
    );
    const view = await renderAsync(tree(0));
    const row = view.get("[data-glossary-row]");

    view.rerender(tree(1));
    const afterProps = commits;
    await flush();

    expect(commits).toBe(afterProps);
    expect(view.get("[data-glossary-row]")).toBe(row);
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("clears a stale notice when an identical read succeeds again", async () => {
    let calls = 0;
    stubRpc({
      "glossary.get": () => (calls++ === 1 ? rpcError("INTERNAL", "gone") : glossaryAnswer(TERMS)),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();
    expect(view.get('[role="alert"]')).toBeTruthy();
    const row = view.get("[data-glossary-row]");

    view.rerender(<GlossaryPanel refreshToken={2} />);
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.get("[data-glossary-row]")).toBe(row);
  });

  it("turns a draft into an orphan at once when its term goes, with no waiting state", async () => {
    let served = TERMS;
    stubRpc({ "glossary.get": () => glossaryAnswer(served) });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Mein Entwurf");

    served = glossaryOf(FILE, { verbatra: "Verbatra" });
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    const block = view.get("[data-orphan-block]");
    expect(block.textContent).toContain("no longer exists");
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Mein Entwurf");
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);
    expect(view.text()).not.toContain("A refresh is waiting");
    expect(view.get("[aria-live]").textContent).toContain("no longer exists");
  });

  it("shows the orphan and Discard before the empty state when the glossary has no terms left", async () => {
    let served = glossaryOf(FILE, { checkout: "Kasse" });
    stubRpc({ "glossary.get": () => glossaryAnswer(served) });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");

    served = glossaryOf(FILE, {});
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    const orphan = view.get("[data-orphan-block]");
    const empty = view.getByText("p", "No glossary terms");
    expect(orphan.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(buttonNamed(view, "Discard draft")).toBeTruthy();
  });

  it("drops the failure and Retry of a term that went away, so Retry cannot recreate it", async () => {
    let served = TERMS;
    stubRpc({
      "glossary.get": () => glossaryAnswer(served),
      "glossary.write": rpcError("LOCK_CONTENDED", "busy"),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Neu");
    await clickAsync(buttonNamed(view, "Save"));
    expect(buttonNamed(view, "Retry")).toBeTruthy();

    served = glossaryOf(FILE, { verbatra: "Verbatra" });
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    expect(view.query("[data-orphan-block]")).not.toBeNull();
    expect(view.query('[role="alert"]')).toBeNull();
    expect(rpcCalls.filter((call) => call.method === "glossary.write")).toHaveLength(1);
  });

  it("does not send a queued write for a term that has gone away in the meantime", async () => {
    const first = deferredAnswer();
    let served = TERMS;
    let writes = 0;
    stubRpc({
      "glossary.get": () => glossaryAnswer(served),
      "glossary.write": () => {
        writes += 1;
        return writes === 1 ? first.promise : glossaryAnswer(TERMS);
      },
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "A");
    await clickAsync(buttonNamed(view, "Save"));
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(
      view.all('input[aria-label="Translation (all locales)"]').at(-1) as HTMLInputElement,
      "B",
    );
    await clickAsync(
      view.all("[data-glossary-row] form button[type=submit]").at(-1) as HTMLElement,
    );

    served = glossaryOf(FILE, { verbatra: "Verbatra" });
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();
    await act(async () => {
      first.resolve(glossaryAnswer(glossaryOf(FILE, { verbatra: "A" })));
      await flush();
      await flush();
    });

    expect(writes).toBe(1);
  });

  it("keeps the last glossary and says so when a refresh fails, with a Retry that does not steal focus", async () => {
    let calls = 0;
    stubRpc({
      "glossary.get": () => (calls++ === 1 ? rpcError("INTERNAL", "gone") : glossaryAnswer(TERMS)),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    const search = textboxNamed(view, "Search terms");
    search.focus();

    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="alert"]').textContent).toContain("Could not refresh the glossary");
    expect(view.text()).toContain("Verbatra");
    expect(document.activeElement).toBe(search);

    await clickAsync(buttonNamed(view, "Retry"));

    expect(view.query('[role="alert"]')).toBeNull();
    expect(rpcCalls).toHaveLength(3);
  });

  it("lets a finished write win over a read that started before it", async () => {
    const stale = deferredAnswer();
    let reads = 0;
    stubRpc({
      "glossary.get": () => (reads++ === 0 ? glossaryAnswer(TERMS) : stale.promise),
      "glossary.write": glossaryAnswer(
        glossaryOf({ source: "file", path: "glossary.json" }, { verbatra: "Written" }),
      ),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Written");
    await clickAsync(buttonNamed(view, "Save"));
    await act(async () => {
      stale.resolve(glossaryAnswer(TERMS));
      await flush();
    });

    expect(view.text()).toContain("Written");
    expect(view.text()).not.toContain("Kasse");
  });

  it("applies only the newest of two overlapping reads", async () => {
    const first = deferredAnswer();
    const second = deferredAnswer();
    const answers = [undefined, first, second];
    stubRpc({
      "glossary.get": () => {
        const next = answers.shift();
        return next === undefined ? glossaryAnswer(TERMS) : next.promise;
      },
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);

    view.rerender(<GlossaryPanel refreshToken={1} />);
    view.rerender(<GlossaryPanel refreshToken={2} />);
    await act(async () => {
      second.resolve(
        glossaryAnswer(
          glossaryOf({ source: "file", path: "glossary.json" }, { verbatra: "Newest" }),
        ),
      );
      await flush();
      first.resolve(
        glossaryAnswer(
          glossaryOf({ source: "file", path: "glossary.json" }, { verbatra: "Older" }),
        ),
      );
      await flush();
    });

    expect(view.text()).toContain("Newest");
    expect(view.text()).not.toContain("Older");
  });
});
