// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../shared/rpc/glossary.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import type { RenderResult, StubRpcResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  flush,
  renderAsync,
  rpcError,
  selectOption,
  sharedTerm,
  stubRpc,
  textboxNamed,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const G = FILE_BACKED_GLOSSARY;
const without = (source: string): GlossaryGetResult => ({
  ...G,
  terms: G.terms.filter((term) => term.source !== source),
});
const ok = (result: GlossaryGetResult): StubRpcResult => ({ ok: true, result });
const field = (view: RenderResult, index = 0): HTMLInputElement =>
  view.all('input[aria-label="Translation (all locales)"]')[index] as HTMLInputElement;

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

describe("a typed orphan below another editor", () => {
  it("moves no row when its term goes, so focus in the other editor survives a real browser", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(field(view, 1), "draft B");
    const mine = field(view, 0);
    mine.focus();
    typeInto(mine, "typing A");
    const list = view.get("[data-glossary-row]").parentElement as HTMLElement;
    const moved: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [...record.removedNodes, ...record.addedNodes]) {
          moved.push((node as HTMLElement).getAttribute?.("data-glossary-row") ?? "?");
        }
      }
    });
    observer.observe(list, { childList: true });

    await bump(without("checkout"));
    observer.disconnect();

    expect(view.query("[data-orphan-block]")).not.toBeNull();
    expect(moved).toEqual([]);
    expect(document.activeElement).toBe(mine);
  });
});

describe("the rebase runs only when the terms change", () => {
  it("keeps a field typed back to its old value after an outside change", async () => {
    const { view, bump } = await panel();
    await clickAsync(buttonNamed(view, "Edit checkout"));
    const original = field(view).value;
    typeInto(field(view), `${original}x`);
    await bump({
      ...G,
      terms: G.terms.map((term) =>
        term.source === "checkout" ? sharedTerm("checkout", "OUTSIDE") : term,
      ),
    });
    expect(field(view).value).toBe(`${original}x`);

    typeInto(field(view), original);
    await flush();

    expect(field(view).value).toBe(original);
  });
});

describe("a removal failure's wording", () => {
  it("promises a Retry only when one is offered", async () => {
    const { view } = await panel();
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "bad") });
    await clickAsync(buttonNamed(view, "Remove verbatra"));
    await clickAsync(buttonNamed(view, "Remove term"));

    const alert = view.get('[role="alert"]').textContent ?? "";
    expect(alert).toContain("Removing this term failed.");
    expect(alert).not.toContain("Retry removes it again");
    expect(view.all("[data-retry]")).toHaveLength(0);
  });
});

describe("the add form's fresh note", () => {
  it("goes away when a scope change discards the add form", async () => {
    const outside: GlossaryGetResult = {
      ...G,
      terms: [...G.terms, sharedTerm("Neu", "Von aussen")],
    };
    const { view } = await panel();
    served = outside;
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Meins");
    await clickAsync(buttonNamed(view, "Add term"));
    expect(view.query("[data-exists-note]")).not.toBeNull();

    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(elementNamed(view, "[data-unsaved-prompt] button", "Discard"));

    expect(view.query("[data-exists-note]")).toBeNull();
    expect(textboxNamed(view, "New glossary term").value).toBe("");
  });
});
