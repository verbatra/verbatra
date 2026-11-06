// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult, GlossaryTermView } from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import type { RenderResult, StubRpcResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  deferredAnswer,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  findNamed,
  flush,
  renderAsync,
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
const ok = (result: GlossaryGetResult): StubRpcResult => ({ ok: true, result });
const field = (view: RenderResult, name: string, index = 0): HTMLInputElement =>
  view.all(`input[aria-label="${name}"], textarea[aria-label="${name}"]`)[
    index
  ] as HTMLInputElement;

function Stateful({ initial }: { readonly initial: GlossaryGetResult }): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return <GlossarySection glossary={glossary} onChange={setGlossary} />;
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

describe("an add that settles after the user typed something else", () => {
  it("keeps what was typed since, and leaves focus where it is", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.get": ok(G), "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={G} />);
    typeInto(textboxNamed(view, "New glossary term"), "Zed");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    await clickAsync(buttonNamed(view, "Add term"));
    await flush();
    await flush();
    typeInto(textboxNamed(view, "New glossary term"), "Other");
    textboxNamed(view, "Search terms").focus();

    await act(async () => {
      pending.resolve(writeAnswer({ ...G, terms: [...G.terms, sharedTerm("Zed", "Wert")] }));
      await flush();
    });

    expect(textboxNamed(view, "New glossary term").value).toBe("Other");
    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
  });
});

describe("the keep form and the kept entries", () => {
  it("offers no Retry for a failure that repeating cannot fix, on an entry or on the form", async () => {
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "nope") });
    const view = await renderAsync(<Stateful initial={G} />);
    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));
    expect(view.get('[role="alert"]').textContent).toContain("nope");
    expect(findNamed(view, "button", "Retry")).toBeUndefined();

    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");
    await clickAsync(buttonNamed(view, "Keep untranslated"));
    expect(view.all('[role="alert"]')).toHaveLength(2);
    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("moves focus to the keep field after Retry removes the last entry", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy") });
    const view = await renderAsync(<Stateful initial={G} />);
    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));
    stubRpc({ "glossary.write": writeAnswer({ ...G, doNotTranslate: [] }) });

    await clickAsync(buttonNamed(view, "Retry"));

    expect(document.activeElement).toBe(textboxNamed(view, "New do-not-translate term"));
  });

  it("keeps newer text and focus elsewhere when a keep settles late", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={G} />);
    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");
    await clickAsync(buttonNamed(view, "Keep untranslated"));
    typeInto(textboxNamed(view, "New do-not-translate term"), "Changed");
    await act(async () => {
      pending.resolve(
        writeAnswer({
          ...G,
          doNotTranslate: [...G.doNotTranslate, { term: "Acme", caseSensitive: true }],
        }),
      );
      await flush();
    });
    expect(textboxNamed(view, "New do-not-translate term").value).toBe("Changed");

    const second = deferredAnswer();
    stubRpc({ "glossary.write": () => second.promise });
    typeInto(textboxNamed(view, "New do-not-translate term"), "Contoso");
    await clickAsync(buttonNamed(view, "Keep untranslated"));
    textboxNamed(view, "Search terms").focus();
    await act(async () => {
      second.resolve(writeAnswer(G));
      await flush();
    });
    expect(textboxNamed(view, "New do-not-translate term").value).toBe("");
    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
  });
});

describe("wording and structure that depend on the data", () => {
  it("says one never-use rule in the singular in the removal dialog", async () => {
    const ruled: GlossaryTermView = {
      source: "Shop",
      targets: { de: "Laden" },
      forbidden: { de: ["a"] },
      caseSensitive: false,
      byLocale: { de: { target: "Laden", inherited: false, forbidden: ["a"] } },
    };
    const view = await renderAsync(<Stateful initial={{ ...G, terms: [ruled] }} />);
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Shop"));
    typeInto(textboxNamed(view, "Translation (de)"), "");
    typeInto(textboxNamed(view, "Never use (de)"), "");
    await clickAsync(buttonNamed(view, "Save"));

    expect(view.query('[role="dialog"]')?.textContent).toContain("1 never-use rule");
    expect(view.query('[role="dialog"]')?.textContent).not.toContain("1 never-use rules");
  });

  it("names all locales when a pending switch goes back to them", async () => {
    const view = await renderAsync(<Stateful initial={G} />);
    selectOption(view.get("select") as HTMLSelectElement, "de");
    typeInto(textboxNamed(view, "New glossary term"), "Neu");

    selectOption(view.get("select") as HTMLSelectElement, "all");

    expect(view.get("[data-unsaved-prompt]").textContent).toContain("Showing all locales drops");
  });

  it("says drafts in the plural when two terms have gone", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(field(view, "Translation (all locales)", 0), "A");
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(field(view, "Translation (all locales)", 1), "B");

    await bump({ ...G, terms: G.terms.filter((term) => term.source === "Dashboard") });

    expect(view.get("[aria-live=polite]").textContent).toContain("2 unsaved drafts belong");
  });

  it("shows no locale selector for a project without target locales", async () => {
    const view = await renderAsync(<Stateful initial={{ ...G, locales: [] }} />);

    expect(view.query("select")).toBeNull();
    expect(textboxNamed(view, "Search terms")).toBeTruthy();
  });

  it("ignores a change to Match case while the row's write is in flight, and leaves part of speech without a direction", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={G} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Neu");
    await clickAsync(buttonNamed(view, "Save"));
    const box = elementNamed(view, "input", "Match case for checkout") as HTMLInputElement;

    await clickAsync(box);

    expect(box.checked).toBe(false);
    expect(textboxNamed(view, "Part of speech").hasAttribute("dir")).toBe(false);
    expect(textboxNamed(view, "Note").getAttribute("dir")).toBe("auto");
  });
});

describe("a removal dialog for a kept entry that disappears, and focus after removing before an open editor", () => {
  it("keeps showing the saved entry after the page drops it", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));

    await bump({ ...G, doNotTranslate: [] });

    expect(view.get("[role=dialog]").textContent).toContain("Northwind");
  });

  it("moves focus into the next row's open editor when that row has no Edit button", async () => {
    const two: GlossaryGetResult = {
      ...G,
      terms: [sharedTerm("a", "A"), sharedTerm("b", "B")],
    };
    stubRpc({ "glossary.write": writeAnswer({ ...two, terms: [sharedTerm("b", "B")] }) });
    const view = await renderAsync(<Stateful initial={two} />);
    await clickAsync(buttonNamed(view, "Edit b"));

    await clickAsync(buttonNamed(view, "Remove a"));
    await clickAsync(buttonNamed(view, "Remove term"));

    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));
  });
});
