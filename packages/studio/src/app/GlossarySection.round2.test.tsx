// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult, GlossaryTermView } from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
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
const fieldOf = (view: RenderResult, name: string, index = 0): HTMLInputElement =>
  view.all(`input[aria-label="${name}"], textarea[aria-label="${name}"]`)[
    index
  ] as HTMLInputElement;

const WITH_VERBATRA = (target: string): GlossaryGetResult => ({
  ...FILE_BACKED_GLOSSARY,
  terms: FILE_BACKED_GLOSSARY.terms.map((term) =>
    term.source === "verbatra" ? sharedTerm("verbatra", target) : term,
  ),
});

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, "", "#/glossary");
});
afterEach(() => vi.restoreAllMocks());

describe("the fresh read before an Add counts as saving", () => {
  async function typedAdd(view: RenderResult, scope?: string): Promise<void> {
    if (scope !== undefined) {
      scopeTo(view, scope);
    }
    typeInto(textboxNamed(view, "New glossary term"), "Neu");
    typeInto(textboxNamed(view, "New glossary translation"), "Wert");
  }

  it("busies the fields and the prompt, ignores Discard, and writes once the read answers", async () => {
    const read = deferredAnswer();
    stubRpc({
      "glossary.get": () => read.promise,
      "glossary.write": writeAnswer({
        ...FILE_BACKED_GLOSSARY,
        terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("Neu", "Wert")],
      }),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await typedAdd(view);
    navigateAway();
    await clickAsync(buttonNamed(view, "Add term"));

    expect(textboxNamed(view, "New glossary term").readOnly).toBe(true);
    expect(prompt(view)?.textContent).toContain("Saving the glossary");
    expect(promptButton(view, "Discard").getAttribute("aria-disabled")).toBe("true");
    await clickAsync(promptButton(view, "Discard"));
    expect(prompt(view)).not.toBeNull();

    await act(async () => {
      read.resolve({ ok: true, result: FILE_BACKED_GLOSSARY });
      await flush();
      await flush();
    });

    expect(glossaryWrites()).toHaveLength(1);
    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
  });

  it("writes nothing when the text changed while the read ran", async () => {
    const read = deferredAnswer();
    stubRpc({
      "glossary.get": () => read.promise,
      "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await typedAdd(view);
    await clickAsync(buttonNamed(view, "Add term"));

    typeInto(textboxNamed(view, "New glossary term"), "Anders");
    await act(async () => {
      read.resolve({ ok: true, result: FILE_BACKED_GLOSSARY });
      await flush();
    });

    expect(glossaryWrites()).toEqual([]);
    expect(textboxNamed(view, "New glossary term").value).toBe("Anders");
  });

  it("writes nothing when the draft was dropped while the read ran", async () => {
    const read = deferredAnswer();
    stubRpc({
      "glossary.get": () => read.promise,
      "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await typedAdd(view);
    await clickAsync(buttonNamed(view, "Add term"));

    typeInto(textboxNamed(view, "New glossary term"), "");
    typeInto(textboxNamed(view, "New glossary translation"), "");
    await act(async () => {
      read.resolve({ ok: true, result: FILE_BACKED_GLOSSARY });
      await flush();
    });

    expect(glossaryWrites()).toEqual([]);
  });

  it("holds a scope switch pending during the read, then writes for the scope it was typed in and applies the switch", async () => {
    const read = deferredAnswer();
    stubRpc({
      "glossary.get": () => read.promise,
      "glossary.write": writeAnswer({
        ...FILE_BACKED_GLOSSARY,
        terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("Neu", "Wert")],
      }),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await typedAdd(view, "de");
    await clickAsync(buttonNamed(view, "Add term"));
    scopeTo(view, "fr");
    expect(promptButton(view, "Discard").getAttribute("aria-disabled")).toBe("true");

    await act(async () => {
      read.resolve({ ok: true, result: FILE_BACKED_GLOSSARY });
      await flush();
      await flush();
    });

    expect(glossaryWrites()).toEqual([
      { method: "glossary.write", params: { term: "Neu", translation: "Wert", locale: "de" } },
    ]);
    expect((view.get("select") as HTMLSelectElement).value).toBe("fr");
  });
});

describe("a failed write with no draft keeps the prompt", () => {
  async function removalAndEditor(): Promise<{
    view: RenderResult;
    removal: ReturnType<typeof deferredAnswer>;
    save: ReturnType<typeof deferredAnswer>;
  }> {
    const removal = deferredAnswer();
    const save = deferredAnswer();
    const answers = [removal, save];
    stubRpc({ "glossary.write": () => (answers.shift() as typeof removal).promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Neu");
    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));
    return { view, removal, save };
  }

  it("stays with the reason after the removal fails and the other edit succeeds, and does not let the route through", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const { view, removal, save } = await removalAndEditor();
    navigateAway();
    await clickAsync(buttonNamed(view, "Save"));

    await act(async () => {
      removal.resolve(rpcError("INTERNAL", "boom"));
      await flush();
      await flush();
    });
    await act(async () => {
      save.resolve(writeAnswer(WITH_VERBATRA("Neu")));
      await flush();
      await flush();
    });

    expect(prompt(view)?.textContent).toContain("unexpected server error");
    expect(hasHeldRoute()).toBe(true);
    expect(go).not.toHaveBeenCalled();
    expect(prompt(view)?.textContent).toContain("could not be saved");
  });

  it("does not apply a pending scope switch while that failure stands, and Discard of drafts keeps it", async () => {
    const { view, removal, save } = await removalAndEditor();
    await clickAsync(buttonNamed(view, "Save"));
    scopeTo(view, "de");

    await act(async () => {
      removal.resolve(rpcError("INTERNAL", "boom"));
      save.resolve(writeAnswer(WITH_VERBATRA("Neu")));
      await flush();
      await flush();
      await flush();
    });

    expect((view.get("select") as HTMLSelectElement).value).toBe("all");
    expect(prompt(view)?.textContent).toContain("unexpected server error");
    await clickAsync(promptButton(view, "Discard"));
    expect((view.get("select") as HTMLSelectElement).value).toBe("de");
    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
  });
});

describe("typing back to clean after a failed write releases the hold", () => {
  it("restores the route instead of letting it through", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "the glossary would be invalid") });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");
    navigateAway();
    await clickAsync(buttonNamed(view, "Save"));
    expect(prompt(view)).not.toBeNull();

    typeInto(textboxNamed(view, "Translation (all locales)"), "Kasse");

    expect(prompt(view)).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-1);
  });
});

describe("Escape and Keep editing", () => {
  const pressEscape = (field: HTMLElement): void => {
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  };

  it("names the term being closed", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");

    pressEscape(textboxNamed(view, "Translation (all locales)"));

    expect(prompt(view)?.textContent).toContain(
      'Closing this editor drops the changes that are not saved: the edit of "checkout".',
    );
  });

  it("returns focus to the editor that asked, not the first dirty one", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(fieldOf(view, "Translation (all locales)", 0), "Eins");
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    const verbatra = fieldOf(view, "Translation (all locales)", 0);
    typeInto(verbatra, "Zwei");

    pressEscape(verbatra);
    await clickAsync(promptButton(view, "Keep editing"));

    expect(document.activeElement).toBe(verbatra);
  });
});

describe("focus stays put when another editor finishes", () => {
  it("does not pull focus out of the editor the user moved to", async () => {
    const first = deferredAnswer();
    stubRpc({ "glossary.write": () => first.promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit verbatra"));
    typeInto(fieldOf(view, "Translation (all locales)", 0), "A");
    await clickAsync(buttonNamed(view, "Edit checkout"));
    const second = fieldOf(view, "Translation (all locales)", 1);
    typeInto(second, "B");
    await clickAsync(view.all("form button[type=submit]")[0] as HTMLElement);
    second.focus();

    await act(async () => {
      first.resolve(writeAnswer(WITH_VERBATRA("A")));
      await flush();
    });

    expect(document.activeElement).toBe(second);
  });
});

describe("never-use caps", () => {
  const LONG = "x".repeat(2_001);

  it("catches a rendering over 2000 characters in the form, with a note", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    scopeTo(view, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));

    typeInto(textboxNamed(view, "Never use (de)"), `Instrumententafel\n${LONG}`);

    expect(view.get("[data-cap-note]").textContent).toContain("at most 2000 characters");
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets an unrelated Save through when a stored list over 50 is left alone", async () => {
    const many: GlossaryTermView = {
      source: "Big",
      target: "Gross",
      targets: {},
      forbidden: { de: Array.from({ length: 60 }, (_, index) => `r${index}`) },
      caseSensitive: false,
      byLocale: { de: { target: "Gross", inherited: true, forbidden: [] } },
    };
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });
    const view = await renderAsync(
      <Stateful initial={{ ...FILE_BACKED_GLOSSARY, terms: [many] }} />,
    );
    scopeTo(view, "de");
    await clickAsync(buttonNamed(view, "Edit Big"));
    typeInto(textboxNamed(view, "Note"), "Eine Notiz");

    expect(view.query("[data-cap-note]")).toBeNull();
    await clickAsync(buttonNamed(view, "Save"));

    expect(glossaryWrites()).toEqual([
      { method: "glossary.write", params: { term: "Big", note: "Eine Notiz" } },
    ]);
  });
});

describe("a redacted term", () => {
  it("is reported as existing in any scope and nothing is written", async () => {
    const redacted: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [
        {
          source: "apiTerm",
          targets: { fr: "[REDACTED]" },
          forbidden: {},
          caseSensitive: false,
          byLocale: {},
        },
      ],
      redactedTerms: ["apiTerm"],
    };
    stubRpc({ "glossary.write": writeAnswer(redacted) });
    const view = await renderAsync(<Stateful initial={redacted} />);
    scopeTo(view, "de");
    typeInto(textboxNamed(view, "New glossary term"), "apiTerm");
    typeInto(textboxNamed(view, "New glossary translation"), "x");

    expect(view.get("[data-exists-note]").textContent).toContain("cannot be edited here");
    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(true);
    expect(glossaryWrites()).toEqual([]);
  });
});

describe("Do not translate", () => {
  it("is one keystroke away from the head of the list", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);

    await clickAsync(buttonNamed(view, "Jump to Do not translate"));

    expect(document.activeElement?.textContent).toBe("Do not translate");
    expect(document.activeElement?.tagName).toBe("H3");
  });

  it("shows a failed removal beside its own entry and names it", async () => {
    stubRpc({ "glossary.write": rpcError("LOCK_CONTENDED", "busy lock") });
    const two: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      doNotTranslate: [
        { term: "One", caseSensitive: true },
        { term: "Two", caseSensitive: true },
      ],
    };
    const view = await renderAsync(<Stateful initial={two} />);
    await clickAsync(buttonNamed(view, "Remove One from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));

    const alert = view.get('[role="alert"]');
    expect(alert.closest("li")?.textContent).toContain("One");
    expect(alert.closest("li")?.textContent).not.toContain("Two");
    expect(alert.textContent).toContain("Could not stop keeping One untranslated");
  });
});

describe("the list cap resets", () => {
  const MANY: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    terms: Array.from({ length: 120 }, (_, index) => sharedTerm(`term-${index}`, `Wert ${index}`)),
  };

  it("caps again after a search change or a scope change", async () => {
    const view = await renderAsync(<Stateful initial={MANY} />);
    await clickAsync(buttonNamed(view, "Show all 120 terms"));
    expect(view.all("[data-glossary-row]")).toHaveLength(120);

    typeInto(textboxNamed(view, "Search terms"), "term-");
    expect(view.all("[data-glossary-row]")).toHaveLength(50);

    await clickAsync(buttonNamed(view, "Show all 120 terms"));
    scopeTo(view, "de");
    expect(view.all("[data-glossary-row]")).toHaveLength(50);
  });
});

describe("a missing glossary file", () => {
  it("says so instead of listing nothing silently", async () => {
    const missing: GlossaryGetResult = {
      indicator: { source: "file", path: "glossary.json" },
      version: null,
      locales: ["de"],
      terms: [],
      doNotTranslate: [],
      redactedTerms: [],
    };
    const view = await renderAsync(<Stateful initial={missing} />);

    expect(view.get("[data-missing-file]").textContent).toContain("glossary.json is missing");
    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });
});
