// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult, GlossaryTermView } from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import { hasHeldRoute } from "./route-guard.js";
import type { RenderResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  deferredAnswer,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  findNamed,
  flush,
  glossaryWrites,
  pressKey,
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

function Stateful({ initial }: { readonly initial: GlossaryGetResult }): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return <GlossarySection glossary={glossary} onChange={setGlossary} />;
}

function navigateAway(): void {
  act(() => {
    window.history.pushState({ idx: 1 }, "", "#/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

const prompt = (view: RenderResult): HTMLElement | null => view.query("[data-unsaved-prompt]");
const promptButton = (view: RenderResult, name: string): HTMLElement =>
  elementNamed(view, "[data-unsaved-prompt] button", name);
const scopeTo = (view: RenderResult, scope: string): void =>
  selectOption(view.get("select") as HTMLSelectElement, scope);
const dialog = (view: RenderResult): HTMLElement | null => view.query('[role="dialog"]');

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, "", "#/glossary");
});
afterEach(() => vi.restoreAllMocks());

async function failedRowSave(view: RenderResult, scope?: string): Promise<void> {
  if (scope !== undefined) {
    scopeTo(view, scope);
  }
  await clickAsync(buttonNamed(view, "Edit checkout"));
  typeInto(
    textboxNamed(
      view,
      scope === undefined ? "Translation (all locales)" : `Translation (${scope})`,
    ),
    "Bezahlung",
  );
  await clickAsync(buttonNamed(view, "Save"));
}

describe("terms named like object keys", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    it(`handles a term named ${name} through render, edit, add, remove and reload`, async () => {
      const base: GlossaryGetResult = {
        ...FILE_BACKED_GLOSSARY,
        terms: [sharedTerm(name, "Wert"), sharedTerm("other", "x")],
        doNotTranslate: [],
      };
      const without: GlossaryGetResult = { ...base, terms: [sharedTerm("other", "x")] };
      const added: GlossaryGetResult = {
        ...base,
        terms: [...base.terms, sharedTerm(`${name}2`, "neu")],
      };
      stubRpc({ "glossary.get": { ok: true, result: base }, "glossary.write": writeAnswer(base) });
      const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
      await flush();

      await clickAsync(buttonNamed(view, `Edit ${name}`));
      typeInto(textboxNamed(view, "Translation (all locales)"), "Neu");
      expect(prompt(view)).toBeNull();
      navigateAway();
      expect(prompt(view)).not.toBeNull();
      await clickAsync(promptButton(view, "Keep editing"));
      await clickAsync(buttonNamed(view, "Save"));
      expect(glossaryWrites()[0]).toMatchObject({ params: { term: name, translation: "Neu" } });

      stubRpc({ "glossary.write": writeAnswer(added) });
      typeInto(textboxNamed(view, "New glossary term"), `${name}2`);
      typeInto(textboxNamed(view, "New glossary translation"), "neu");
      await clickAsync(buttonNamed(view, "Add term"));

      stubRpc({ "glossary.write": writeAnswer(without) });
      await clickAsync(buttonNamed(view, `Remove ${name}`));
      await clickAsync(buttonNamed(view, "Remove term"));
      expect(findNamed(view, "button", `Edit ${name}`)).toBeUndefined();

      stubRpc({ "glossary.get": { ok: true, result: base } });
      view.rerender(<GlossaryPanel refreshToken={1} />);
      await flush();
      expect(buttonNamed(view, `Edit ${name}`)).toBeTruthy();
    });
  }
});

describe("Retry resends only an unchanged, still wanted action", () => {
  it("drops a failed row Save when the scope changes and the draft is discarded", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await failedRowSave(view, "de");

    scopeTo(view, "fr");
    await clickAsync(promptButton(view, "Discard"));

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("drops a failed add when the scope changes and the draft is discarded", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    scopeTo(view, "de");
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    await clickAsync(buttonNamed(view, "Add term"));
    expect(buttonNamed(view, "Retry")).toBeTruthy();

    scopeTo(view, "fr");
    await clickAsync(promptButton(view, "Discard"));

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("drops a failure when the editor is closed with Discard from a held route", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await failedRowSave(view);

    navigateAway();
    await clickAsync(promptButton(view, "Discard"));

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("clears the failure as soon as the draft is typed into, so Save takes over and Retry cannot close newer text", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await failedRowSave(view);
    expect(buttonNamed(view, "Retry")).toBeTruthy();

    typeInto(textboxNamed(view, "Translation (all locales)"), "Zweite neuere Eingabe");

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Zweite neuere Eingabe");
    expect(glossaryWrites()).toHaveLength(1);
  });

  it("clears an add failure when the add form is typed into", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New glossary term"), "Alt");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    await clickAsync(buttonNamed(view, "Add term"));

    typeInto(textboxNamed(view, "New glossary term"), "Korrigiert");

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("drops a failed Remove's Retry as soon as an editor opens on that term", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));
    expect(buttonNamed(view, "Retry")).toBeTruthy();

    await clickAsync(buttonNamed(view, "Edit checkout"));

    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("clears the keep field, with no phantom prompt, when Retry succeeds, and focuses the field", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");
    await clickAsync(buttonNamed(view, "Keep untranslated"));
    stubRpc({
      "glossary.write": writeAnswer({
        ...FILE_BACKED_GLOSSARY,
        doNotTranslate: [
          ...FILE_BACKED_GLOSSARY.doNotTranslate,
          { term: "Acme", caseSensitive: true },
        ],
      }),
    });

    await clickAsync(buttonNamed(view, "Retry"));

    expect(textboxNamed(view, "New do-not-translate term").value).toBe("");
    expect(document.activeElement).toBe(textboxNamed(view, "New do-not-translate term"));
    navigateAway();
    expect(prompt(view)).toBeNull();
  });

  it("names the entry in a removal error and focuses the next entry after Retry succeeds", async () => {
    const two: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      doNotTranslate: [
        { term: "One", caseSensitive: true },
        { term: "Two", caseSensitive: true },
      ],
    };
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const view = await renderAsync(<Stateful initial={two} />);
    await clickAsync(buttonNamed(view, "Remove One from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));
    expect(view.get('[role="alert"]').textContent).toContain("Could not stop keeping One");
    stubRpc({
      "glossary.write": writeAnswer({
        ...two,
        doNotTranslate: [{ term: "Two", caseSensitive: true }],
      }),
    });

    await clickAsync(buttonNamed(view, "Retry"));

    expect(document.activeElement).toBe(buttonNamed(view, "Remove Two from do not translate"));
  });
});

describe("a stored rendering is never rewritten", () => {
  const COMMA: GlossaryTermView = {
    source: "Acme",
    target: "Acme",
    targets: {},
    caseSensitive: false,
    forbidden: { de: ["Foo, Inc."], ar: ["شركة، محدودة"] },
    byLocale: {
      de: { target: "Acme", inherited: true, forbidden: ["Foo, Inc."] },
      ar: { target: "Acme", inherited: true, forbidden: ["شركة، محدودة"] },
    },
  };
  const COMMA_GLOSSARY: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    locales: ["de", "ar"],
    terms: [COMMA],
  };

  for (const locale of ["de", "ar"]) {
    it(`${locale}: an untouched editor is clean and a note edit leaves the renderings alone`, async () => {
      stubRpc({ "glossary.write": writeAnswer(COMMA_GLOSSARY) });
      const view = await renderAsync(<Stateful initial={COMMA_GLOSSARY} />);
      scopeTo(view, locale);
      await clickAsync(buttonNamed(view, "Edit Acme"));

      expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);
      navigateAway();
      expect(prompt(view)).toBeNull();
      expect(hasHeldRoute()).toBe(false);

      typeInto(textboxNamed(view, "Note"), "Eine Notiz");
      await clickAsync(buttonNamed(view, "Save"));
      expect(glossaryWrites()).toEqual([
        { method: "glossary.write", params: { term: "Acme", note: "Eine Notiz" } },
      ]);
    });
  }

  it("shows each stored rendering on its own line and says so in the field's hint", async () => {
    const view = await renderAsync(<Stateful initial={COMMA_GLOSSARY} />);
    scopeTo(view, "de");
    await clickAsync(buttonNamed(view, "Edit Acme"));

    expect(textboxNamed(view, "Never use (de)").value).toBe("Foo, Inc.");
    expect(view.get("[data-field-hint]").textContent).toContain("One per line");
  });

  it("does not open an editor dirty for a stored value with surrounding whitespace", async () => {
    const padded = { ...FILE_BACKED_GLOSSARY, terms: [sharedTerm("pad", " x ")] };
    const view = await renderAsync(<Stateful initial={padded} />);
    await clickAsync(buttonNamed(view, "Edit pad"));

    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("saving is real", () => {
  async function dirtyCheckout(view: RenderResult): Promise<void> {
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");
  }
  const GONE = {
    ...FILE_BACKED_GLOSSARY,
    terms: FILE_BACKED_GLOSSARY.terms.map((term) =>
      term.source === "checkout" ? sharedTerm("checkout", "Entwurf") : term,
    ),
  };

  it("says it is saving, busies the prompt and lets the held route through when the write succeeds", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await dirtyCheckout(view);
    navigateAway();
    await clickAsync(buttonNamed(view, "Save"));

    expect(prompt(view)?.textContent).not.toContain("not saved");
    expect(prompt(view)?.textContent).toContain("Saving the glossary");
    expect(promptButton(view, "Discard").getAttribute("aria-disabled")).toBe("true");
    expect(promptButton(view, "Keep editing").getAttribute("aria-disabled")).toBe("true");

    await act(async () => {
      pending.resolve(writeAnswer(GONE));
      await flush();
      await flush();
    });

    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
    expect(window.location.hash).toBe("#/settings");
  });

  it("keeps the prompt with the reason when the write fails", async () => {
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "the glossary would be invalid") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await dirtyCheckout(view);
    navigateAway();

    await clickAsync(buttonNamed(view, "Save"));

    expect(prompt(view)).not.toBeNull();
    expect(prompt(view)?.textContent).toContain("the glossary would be invalid");
    expect(promptButton(view, "Discard").getAttribute("aria-disabled")).toBeNull();
    expect(hasHeldRoute()).toBe(true);
  });

  it("applies a pending scope change once the write that was running succeeds", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await dirtyCheckout(view);
    await clickAsync(buttonNamed(view, "Save"));
    scopeTo(view, "de");
    expect(prompt(view)).not.toBeNull();

    await act(async () => {
      pending.resolve(writeAnswer(GONE));
      await flush();
      await flush();
    });

    expect(prompt(view)).toBeNull();
    expect((view.get("select") as HTMLSelectElement).value).toBe("de");
  });
});

describe("a draft whose term has gone", () => {
  const WITHOUT_CHECKOUT: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    terms: FILE_BACKED_GLOSSARY.terms.filter((term) => term.source !== "checkout"),
  };

  async function orphan(): Promise<RenderResult> {
    stubRpc({
      "glossary.get": { ok: true, result: FILE_BACKED_GLOSSARY },
      "glossary.write": writeAnswer({
        ...WITHOUT_CHECKOUT,
        terms: [...WITHOUT_CHECKOUT.terms, sharedTerm("Neu", "Wert")],
      }),
    });
    const view = await renderAsync(<GlossaryPanel refreshToken={0} />);
    await flush();
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Mein Entwurf");
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    await clickAsync(buttonNamed(view, "Add term"));
    await flush();
    return view;
  }

  it("stays visible with a notice, holds navigation and goes on Discard", async () => {
    const view = await orphan();

    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Mein Entwurf");
    expect(view.get("[data-orphan-notice]").textContent).toContain("no longer exists");
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);
    navigateAway();
    expect(prompt(view)?.textContent).toContain('the edit of "checkout"');

    await clickAsync(promptButton(view, "Discard"));

    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
  });

  it("is dropped by its own Discard draft button", async () => {
    const view = await orphan();

    await clickAsync(buttonNamed(view, "Discard draft"));

    expect(view.query("[data-orphan-notice]")).toBeNull();
  });

  it("never leaves a refresh waiting with no editor to finish", async () => {
    const view = await orphan();
    const before = rpcCalls.filter((call) => call.method === "glossary.get").length;

    view.rerender(<GlossaryPanel refreshToken={1} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "glossary.get").length).toBe(before + 1);
    expect(view.text()).not.toContain("A refresh is waiting");
  });
});

describe("a hold arriving while a dialog is open", () => {
  it("closes the dialog as cancelled and focuses Keep editing in the prompt", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");
    await clickAsync(buttonNamed(view, "Remove verbatra"));
    expect(dialog(view)).not.toBeNull();

    navigateAway();
    await flush();

    expect(dialog(view)).toBeNull();
    expect(glossaryWrites()).toEqual([]);
    expect(prompt(view)).not.toBeNull();
    expect(document.activeElement).toBe(promptButton(view, "Keep editing"));
  });
});

describe("Escape in a dirty editor", () => {
  async function editor(view: RenderResult): Promise<HTMLInputElement> {
    await clickAsync(buttonNamed(view, "Edit checkout"));
    return textboxNamed(view, "Translation (all locales)");
  }
  const pressEscape = (field: HTMLElement, init: KeyboardEventInit = {}): void => {
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init }));
    });
  };

  it("asks first with Discard and Keep editing, and Discard closes only that editor", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = await editor(view);
    typeInto(field, "Entwurf");
    await clickAsync(buttonNamed(view, "Edit verbatra"));

    pressEscape(field);

    expect(prompt(view)?.textContent).toContain("Closing this editor");
    await clickAsync(promptButton(view, "Keep editing"));
    expect(prompt(view)).toBeNull();
    expect(textboxNamed(view, "Translation (all locales)")).toBeTruthy();

    pressEscape(field);
    await clickAsync(promptButton(view, "Discard"));

    expect(view.all('input[aria-label="Translation (all locales)"]')).toHaveLength(1);
    expect(document.activeElement).toBe(buttonNamed(view, "Edit checkout"));
  });

  it("closes a clean editor at once", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = await editor(view);

    pressEscape(field);

    expect(prompt(view)).toBeNull();
    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
  });

  it("ignores Escape pressed during IME composition", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = await editor(view);
    typeInto(field, "Entwurf");

    pressEscape(field, { isComposing: true });

    expect(prompt(view)).toBeNull();
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Entwurf");
  });

  it("releases the Escape prompt when the draft is typed back to clean", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = await editor(view);
    typeInto(field, "Entwurf");
    pressEscape(field);
    expect(prompt(view)).not.toBeNull();

    typeInto(field, "Kasse");

    expect(prompt(view)).toBeNull();
  });
});

describe("adding checks the file first", () => {
  it("shows the exists note instead of writing when the term appeared meanwhile", async () => {
    const outside: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("Neu", "Von aussen")],
    };
    stubRpc({
      "glossary.get": { ok: true, result: outside },
      "glossary.write": writeAnswer(outside),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Meins");

    await clickAsync(buttonNamed(view, "Add term"));

    expect(glossaryWrites()).toEqual([]);
    expect(view.get("[data-exists-note]").textContent).toContain("Neu is already in the glossary");
    expect(textboxNamed(view, "New glossary translation").value).toBe("Meins");
  });

  it("writes when the fresh read still shows the term as new, or cannot be read", async () => {
    stubRpc({
      "glossary.get": { ok: true, result: FILE_BACKED_GLOSSARY },
      "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
    await clickAsync(buttonNamed(view, "Add term"));
    expect(glossaryWrites()).toHaveLength(1);

    stubRpc({ "glossary.get": rpcError("INTERNAL", "unreadable") });
    typeInto(textboxNamed(view, "New glossary term"), "Noch");
    typeInto(textboxNamed(view, "New glossary translation"), "Eins");
    await clickAsync(buttonNamed(view, "Add term"));
    expect(glossaryWrites()).toHaveLength(2);
  });
});

describe("focus after search", () => {
  it("returns focus to the search field after Clear search", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "Search terms"), "qqqq");
    const clear = buttonNamed(view, "Clear search");
    clear.focus();

    await clickAsync(clear);

    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
  });

  it("returns focus to the search field after Cancel when the search hides the row", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New glossary term"), "checkout");
    typeInto(textboxNamed(view, "New glossary translation"), "x");
    typeInto(textboxNamed(view, "Search terms"), "qqqq");
    await clickAsync(elementNamed(view, "[data-exists-note] button", "Edit checkout"));

    await clickAsync(buttonNamed(view, "Cancel"));

    expect(document.activeElement).toBe(textboxNamed(view, "Search terms"));
  });
});

describe("slow writes", () => {
  it("keeps the row busy and the draft intact while a slow write is pending", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Langsam");
    await clickAsync(buttonNamed(view, "Save"));

    expect(buttonNamed(view, "Save").getAttribute("aria-busy")).toBe("true");
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Langsam");

    await act(async () => {
      pending.resolve(writeAnswer(FILE_BACKED_GLOSSARY));
      await flush();
    });
    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
  });
});

void pressKey;
