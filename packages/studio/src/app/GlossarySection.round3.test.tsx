// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult, GlossaryTermView } from "../shared/rpc/glossary.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import { hasHeldRoute } from "./route-guard.js";
import type { RenderResult, StubRpcResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  DASHBOARD_TERM,
  deferredAnswer,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  findNamed,
  flush,
  glossaryWrites,
  renderAsync,
  rpcCalls,
  rpcError,
  selectOption,
  sharedTerm,
  stubRpc,
  textboxNamed,
  typeInto,
  writeAnswer,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const G = FILE_BACKED_GLOSSARY;
const without = (source: string): GlossaryGetResult => ({
  ...G,
  terms: G.terms.filter((term) => term.source !== source),
});
const withTerm = (term: GlossaryTermView): GlossaryGetResult => ({
  ...G,
  terms: G.terms.map((candidate) => (candidate.source === term.source ? term : candidate)),
});
const ok = (result: GlossaryGetResult): StubRpcResult => ({ ok: true, result });
const field = (view: RenderResult, name: string, index = 0): HTMLInputElement =>
  view.all(`input[aria-label="${name}"], textarea[aria-label="${name}"]`)[
    index
  ] as HTMLInputElement;
const prompt = (view: RenderResult): HTMLElement | null => view.query("[data-unsaved-prompt]");
const promptButton = (view: RenderResult, name: string): HTMLElement =>
  elementNamed(view, "[data-unsaved-prompt] button", name);
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function navigateAway(): void {
  act(() => {
    window.history.pushState({ idx: 1 }, "", "#/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

let served: GlossaryGetResult = G;

async function panel(): Promise<{
  view: RenderResult;
  bump: (next?: GlossaryGetResult) => Promise<void>;
}> {
  stubRpc({ "glossary.get": () => ok(served) });
  const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
  let token = 0;
  return {
    view,
    bump: async (next) => {
      if (next !== undefined) {
        served = next;
      }
      token += 1;
      view.rerender(<GlossaryPanel refreshToken={token} />);
      await flush();
      await flush();
    },
  };
}

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, "", "#/glossary");
  served = G;
});
afterEach(() => vi.restoreAllMocks());

describe("a clean editor follows an outside change", () => {
  const grown: GlossaryTermView = {
    ...DASHBOARD_TERM,
    forbidden: { de: ["Instrumententafel", "y"] },
    targets: { de: "Extern" },
    byLocale: {
      ...DASHBOARD_TERM.byLocale,
      de: { target: "Extern", inherited: false, forbidden: ["Instrumententafel", "y"] },
    },
  };

  it("shows the new translation and rendering, and a later edit keeps them", async () => {
    const { view, bump } = await panel();
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));

    await bump(withTerm(grown));

    expect(field(view, "Translation (de)").value).toBe("Extern");
    expect(field(view, "Never use (de)").value).toBe("Instrumententafel\ny");
    typeInto(field(view, "Never use (de)"), "Instrumententafel\ny\nz");
    stubRpc({ "glossary.write": writeAnswer(G) });
    await clickAsync(buttonNamed(view, "Save"));
    expect(glossaryWrites()).toEqual([
      {
        method: "glossary.write",
        params: { term: "Dashboard", locale: "de", forbidden: ["Instrumententafel", "y", "z"] },
      },
    ]);
    navigateAway();
    expect(prompt(view)).toBeNull();
  });

  it("leaves an edited editor on the user's text", async () => {
    const { view, bump } = await panel();
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));
    typeInto(field(view, "Translation (de)"), "Meins");

    await bump(withTerm(grown));

    expect(field(view, "Translation (de)").value).toBe("Meins");
  });
});

describe("a background change never moves focus", () => {
  it("keeps focus in the other editor the user is typing in when a term goes orphan", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)", 0), "draft A");
    await clickAsync(buttonNamed(view, "Edit checkout"));
    const other = field(view, "Translation (all locales)", 1);
    other.focus();
    typeInto(other, "typing B");

    await bump(without("verbatra"));

    expect(view.query("[data-orphan-block]")).not.toBeNull();
    expect((document.activeElement as HTMLInputElement).value).toBe("typing B");
  });

  it("keeps focus in search, and in the add form when the term comes back", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)"), "draft A");
    const search = textboxNamed(view, "Search terms");
    search.focus();
    await bump(without("verbatra"));
    expect(document.activeElement).toBe(search);

    const add = textboxNamed(view, "New glossary term");
    add.focus();
    await bump(G);
    expect(document.activeElement).toBe(add);
    expect(field(view, "Translation (all locales)").value).toBe("draft A");
  });

  it("keeps the orphaned editor's own node and focus while the user types in it", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    const own = field(view, "Translation (all locales)");
    own.focus();
    typeInto(own, "draft A");

    await bump(without("verbatra"));

    expect(view.query("[data-orphan-block]")).not.toBeNull();
    expect(document.activeElement).toBe(own);
    expect(field(view, "Translation (all locales)")).toBe(own);
    const row = own.closest("li") as HTMLElement;
    expect([...(row.parentElement?.children ?? [])].indexOf(row)).toBe(0);

    await bump(G);
    expect(field(view, "Translation (all locales)")).toBe(own);
  });

  it("pins the orphan above the list and before the empty state", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)"), "draft A");

    await bump({ ...G, terms: [] });

    const orphan = view.get("[data-orphan-block]");
    expect(orphan.className).toContain("order-first");
    const empty = view.getByText("p", "No glossary terms");
    expect(orphan.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("a queued write under the real scheduler", () => {
  it("is not sent for a term the previous response removed", async () => {
    const { view } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)", 0), "A2");
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(field(view, "Translation (all locales)", 1), "B2");
    const first = deferredAnswer();
    let writes = 0;
    stubRpc({
      "glossary.write": () => {
        writes += 1;
        return writes === 1 ? first.promise : writeAnswer(without("checkout"));
      },
    });
    const saves = view.all("[data-glossary-row] form button[type=submit]");
    await clickAsync(saves[0] as HTMLElement);
    await clickAsync(saves[1] as HTMLElement);

    first.resolve(
      writeAnswer({
        ...without("checkout"),
        terms: without("checkout").terms.map((term) =>
          term.source === "verbatra" ? sharedTerm("verbatra", "A2") : term,
        ),
      }),
    );
    await wait(50);
    await flush();

    expect(glossaryWrites()).toHaveLength(1);
  });
});

describe("a queued removal", () => {
  it("is not sent for a term an outside read removed while it waited", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)"), "A2");
    const first = deferredAnswer();
    let writes = 0;
    stubRpc({
      "glossary.write": () => {
        writes += 1;
        return writes === 1 ? first.promise : writeAnswer(G);
      },
    });
    await clickAsync(buttonNamed(view, "Save"));
    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));

    await bump(without("checkout"));
    await act(async () => {
      first.resolve(writeAnswer(without("checkout")));
      await wait(30);
    });
    await flush();

    expect(writes).toBe(1);
  });
});

describe("the fresh read before an Add is only a check", () => {
  it("neither replaces what is shown nor cancels the background read", async () => {
    const updated = withTerm(sharedTerm("checkout", "Neu"));
    const { view } = await panel();
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(field(view, "Translation (all locales)"), "Neu");
    const save = deferredAnswer();
    let writes = 0;
    stubRpc({
      "glossary.write": () => (writes++ === 0 ? save.promise : rpcError("LOCK_CONTENDED", "busy")),
    });
    await clickAsync(buttonNamed(view, "Save"));
    typeInto(textboxNamed(view, "New glossary term"), "Zed");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    const check = deferredAnswer();
    const background = deferredAnswer();
    let reads = 0;
    stubRpc({ "glossary.get": () => (reads++ === 0 ? check.promise : background.promise) });
    await clickAsync(buttonNamed(view, "Add term"));
    await act(async () => {
      save.resolve(writeAnswer(updated));
      await Promise.resolve();
    });
    await flush();
    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    await act(async () => {
      check.resolve(ok(G));
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      background.resolve(ok(updated));
      await Promise.resolve();
    });
    await flush();
    await flush();

    expect(view.text()).toContain("Neu");
    expect(view.text()).not.toContain("Kasse");
  });

  it("names a term found only in the fresh read, without an Edit button", async () => {
    const outside: GlossaryGetResult = {
      ...G,
      terms: [...G.terms, sharedTerm("Neu", "Von aussen")],
    };
    const { view } = await panel();
    served = outside;
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Meins");

    await clickAsync(buttonNamed(view, "Add term"));

    const note = view.get("[data-exists-note]");
    expect(note.textContent).toContain("Neu is already in the glossary");
    expect(note.querySelector("button")).toBeNull();
    expect(glossaryWrites()).toEqual([]);
    typeInto(textboxNamed(view, "New glossary term"), "Anders");
    expect(view.query("[data-exists-note]")).toBeNull();
  });
});

describe("a removal dialog shows live data", () => {
  it("names the term as it stands now", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Remove checkout"));

    await bump(withTerm({ ...sharedTerm("checkout", "Extern"), note: "external note" }));

    const dialog = view.get("[role=dialog]").textContent ?? "";
    expect(dialog).toContain("Extern");
    expect(dialog).toContain("external note");
    expect(dialog).not.toContain("Kasse");
  });

  it("keeps showing the saved term when it disappears", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Remove checkout"));

    await bump(without("checkout"));

    expect(view.get("[role=dialog]").textContent).toContain("Kasse");
  });

  it("follows a do-not-translate entry's Match case", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));
    expect(view.get("[role=dialog]").textContent).toContain("Match case setting is dropped");

    await bump({ ...G, doNotTranslate: [{ term: "Northwind", caseSensitive: false }] });

    expect(view.get("[role=dialog]").textContent).not.toContain("Match case setting is dropped");
  });
});

describe("a failure nobody can see", () => {
  it("is dropped with its term, does not come back with it, and the prompt names what failed", async () => {
    const { view, bump } = await panel();
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy") });
    await clickAsync(buttonNamed(view, "Remove verbatra"));
    await clickAsync(buttonNamed(view, "Remove term"));
    await flush();
    expect(view.get('[role="alert"]').textContent).toContain("Removing this term failed");

    await bump(without("verbatra"));
    expect(view.query('[role="alert"]')).toBeNull();
    await bump(G);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("names the failed edit in the prompt and Keep editing goes to the failed row", async () => {
    const { view } = await panel();
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy") });
    await clickAsync(buttonNamed(view, "Remove verbatra"));
    await clickAsync(buttonNamed(view, "Remove term"));
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(field(view, "Translation (all locales)"), "Neu");
    navigateAway();
    stubRpc({ "glossary.write": writeAnswer(withTerm(sharedTerm("checkout", "Neu"))) });
    await clickAsync(buttonNamed(view, "Save"));
    await flush();
    await flush();

    expect(prompt(view)?.textContent).toContain('Removing "verbatra" could not be saved.');
    await clickAsync(promptButton(view, "Keep editing"));

    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
    expect(document.activeElement).toBe(buttonNamed(view, "Edit verbatra"));
  });
});

describe("wording", () => {
  it("tells a failed removal's Retry what it retries", async () => {
    const { view } = await panel();
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy") });
    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));

    expect(view.get('[role="alert"]').textContent).toContain(
      "Removing this term failed. Retry removes it again.",
    );
  });

  it("compares never-use text after normalising, so a trailing newline alone is not a change", async () => {
    const list = Array.from({ length: 60 }, (_, index) => `r${index}`);
    const big: GlossaryTermView = {
      ...DASHBOARD_TERM,
      forbidden: { de: list },
      byLocale: {
        ...DASHBOARD_TERM.byLocale,
        de: { target: "Übersicht", inherited: false, forbidden: list },
      },
    };
    served = withTerm(big);
    const { view } = await panel();
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));

    typeInto(field(view, "Never use (de)"), `${list.join("\n")}\n\n`);
    typeInto(textboxNamed(view, "Note"), "changed");

    expect(view.query("[data-cap-note]")).toBeNull();
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("leaves focus alone when an add settles while the user is elsewhere", async () => {
    stubRpc({
      "glossary.get": () => ok(G),
      "glossary.write": writeAnswer({ ...G, terms: [...G.terms, sharedTerm("Zed", "Wert")] }),
    });
    const { view } = await panel();
    typeInto(textboxNamed(view, "New glossary term"), "Zed");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    const submit = buttonNamed(view, "Add term");
    stubRpc({ "glossary.write": deferredFor() });
    function deferredFor(): () => Promise<StubRpcResult> {
      return () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(writeAnswer({ ...G, terms: [...G.terms, sharedTerm("Zed", "Wert")] })),
            20,
          ),
        );
    }
    await clickAsync(submit);
    textboxNamed(view, "Search terms").focus();
    await act(async () => {
      await wait(60);
    });
    await flush();

    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
    expect(rpcCalls.some((call) => call.method === "glossary.write")).toBe(true);
  });
});
