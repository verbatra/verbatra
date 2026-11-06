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
  pressKey,
  render,
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

function Stateful({
  initial,
  onChange,
}: {
  readonly initial: GlossaryGetResult;
  readonly onChange?: (next: GlossaryGetResult) => void;
}): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return (
    <GlossarySection
      glossary={glossary}
      onChange={(next) => {
        onChange?.(next);
        setGlossary(next);
      }}
    />
  );
}

function without(glossary: GlossaryGetResult, ...sources: string[]): GlossaryGetResult {
  return { ...glossary, terms: glossary.terms.filter((term) => !sources.includes(term.source)) };
}

const ONLY_GERMAN: GlossaryTermView = {
  source: "Shop",
  targets: { de: "Laden" },
  forbidden: {},
  caseSensitive: false,
  note: "Storefront",
  byLocale: { de: { target: "Laden", inherited: false, forbidden: [] } },
};

function navigateAway(): void {
  act(() => {
    window.history.pushState({ idx: 1 }, "", "#/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function landBack(): void {
  act(() => {
    window.history.replaceState({ idx: 0 }, "", "#/glossary");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function prompt(view: RenderResult): HTMLElement | null {
  return view.query("[data-unsaved-prompt]");
}

function promptButton(view: RenderResult, name: string): HTMLElement {
  return elementNamed(view, "[data-unsaved-prompt] button", name);
}

async function openDirtyEditor(view: RenderResult, term = "checkout"): Promise<void> {
  await clickAsync(buttonNamed(view, `Edit ${term}`));
  typeInto(textboxNamed(view, "Translation (all locales)"), "Bezahlung");
}

function dialog(view: RenderResult): HTMLElement | null {
  return view.query('[role="dialog"]');
}

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, "", "#/glossary");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GlossarySection, leaving with unsaved edits", () => {
  it("holds a route change while an editor is dirty and names what would be lost", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);

    navigateAway();

    expect(prompt(view)?.textContent).toContain('the edit of "checkout"');
    expect(hasHeldRoute()).toBe(true);
    expect(promptButton(view, "Keep editing").getAttribute("data-variant")).toBe("primary");
    expect(findNamed(view, "[data-unsaved-prompt] button", "Save")).toBeUndefined();
    expect(document.activeElement).toBe(promptButton(view, "Keep editing"));
  });

  it("lets the held route through on Discard and drops every draft", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    typeInto(textboxNamed(view, "New glossary term"), "cart");

    navigateAway();
    await clickAsync(promptButton(view, "Discard"));

    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
    expect(textboxNamed(view, "New glossary term").value).toBe("");
  });

  it("restores the position on Keep editing and returns focus to the draft", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    navigateAway();

    await clickAsync(promptButton(view, "Keep editing"));

    expect(prompt(view)).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-1);
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Bezahlung");
    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));
  });

  it("releases the hold, once, when the draft is typed back to clean", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    navigateAway();

    typeInto(textboxNamed(view, "Translation (all locales)"), "Kasse");

    expect(prompt(view)).toBeNull();
    expect(go).toHaveBeenCalledTimes(1);
    expect(hasHeldRoute()).toBe(false);
  });

  it("drops the prompt and refocuses the field when the browser lands back on the position", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    navigateAway();
    expect(prompt(view)).not.toBeNull();

    landBack();

    expect(prompt(view)).toBeNull();
    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));
  });

  it("guards a dirty add form and a dirty do-not-translate form too", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );

    typeInto(textboxNamed(view, "New glossary term"), "cart");
    navigateAway();
    expect(prompt(view)?.textContent).toContain("the new term");
    await clickAsync(promptButton(view, "Keep editing"));
    expect(document.activeElement).toBe(textboxNamed(view, "New glossary term"));
    typeInto(textboxNamed(view, "New glossary term"), "");

    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");
    navigateAway();
    expect(prompt(view)?.textContent).toContain("the new do-not-translate term");
    await clickAsync(promptButton(view, "Keep editing"));
    expect(document.activeElement).toBe(textboxNamed(view, "New do-not-translate term"));
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("does not hold a route for an editor that is open but unchanged", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Edit checkout"));

    navigateAway();

    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
  });

  it("warns before a full page unload only while a draft is dirty", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    const unload = (): boolean => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(unload()).toBe(false);
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    expect(unload()).toBe(true);
    typeInto(textboxNamed(view, "New glossary term"), "");
    expect(unload()).toBe(false);
  });

  it("treats a background refresh as no navigation: the draft survives and nothing is held", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);

    view.rerender(
      <GlossarySection
        glossary={{
          ...FILE_BACKED_GLOSSARY,
          terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("new", "Neu")],
        }}
        onChange={() => {}}
      />,
    );

    expect(prompt(view)).toBeNull();
    expect(hasHeldRoute()).toBe(false);
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Bezahlung");
  });
});

describe("GlossarySection, switching scope with unsaved edits", () => {
  it("asks first, and Keep editing leaves the scope and the draft alone", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);

    selectOption(view.get("select") as HTMLSelectElement, "de");

    expect(prompt(view)?.textContent).toContain("Showing de drops the changes");
    expect((view.get("select") as HTMLSelectElement).value).toBe("all");
    await clickAsync(promptButton(view, "Keep editing"));

    expect(prompt(view)).toBeNull();
    expect((view.get("select") as HTMLSelectElement).value).toBe("all");
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Bezahlung");
    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));
  });

  it("applies the scope and drops the draft on Discard, then focuses the selector", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    selectOption(view.get("select") as HTMLSelectElement, "de");

    await clickAsync(promptButton(view, "Discard"));

    expect(prompt(view)).toBeNull();
    expect((view.get("select") as HTMLSelectElement).value).toBe("de");
    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
    expect(document.activeElement).toBe(view.get("select"));
  });

  it("never retargets add-form text to another scope", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Warenkorb");

    selectOption(view.get("select") as HTMLSelectElement, "fr");

    expect(prompt(view)?.textContent).toContain("the new term");
    expect(textboxNamed(view, "New glossary translation").placeholder).toBe(
      "Translation for all locales",
    );
    await clickAsync(promptButton(view, "Discard"));
    expect(textboxNamed(view, "New glossary translation").placeholder).toBe("Translation for fr");
    expect(textboxNamed(view, "New glossary translation").value).toBe("");
  });

  it("closes a clean open editor silently when the scope changes", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Edit checkout"));

    selectOption(view.get("select") as HTMLSelectElement, "de");

    expect(prompt(view)).toBeNull();
    expect((view.get("select") as HTMLSelectElement).value).toBe("de");
    expect(findNamed(view, "input", "Translation (de)")).toBeUndefined();
  });

  it("lets a do-not-translate draft ride along across scopes", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");

    selectOption(view.get("select") as HTMLSelectElement, "de");

    expect(prompt(view)).toBeNull();
    expect(textboxNamed(view, "New do-not-translate term").value).toBe("Acme");
  });

  it("drops the scope prompt when the draft is typed back to clean", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    selectOption(view.get("select") as HTMLSelectElement, "de");
    expect(prompt(view)).not.toBeNull();

    typeInto(textboxNamed(view, "Translation (all locales)"), "Kasse");

    expect(prompt(view)).toBeNull();
    expect((view.get("select") as HTMLSelectElement).value).toBe("all");
  });

  it("replaces a scope prompt with the route prompt when a route change arrives", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    selectOption(view.get("select") as HTMLSelectElement, "de");

    navigateAway();

    expect(view.all("[data-unsaved-prompt]")).toHaveLength(1);
    expect(prompt(view)?.textContent).toContain("The glossary has changes that are not saved");
    await clickAsync(promptButton(view, "Keep editing"));
    expect(go).toHaveBeenCalledTimes(1);
    expect((view.get("select") as HTMLSelectElement).value).toBe("all");
  });

  it("releases a held route before asking about a scope change", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);
    navigateAway();

    selectOption(view.get("select") as HTMLSelectElement, "de");

    expect(go).toHaveBeenCalledTimes(1);
    expect(view.all("[data-unsaved-prompt]")).toHaveLength(1);
    expect(prompt(view)?.textContent).toContain("Showing de drops");
  });

  it("keeps the same scope when the selector is set to the value it already has", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await openDirtyEditor(view);

    selectOption(view.get("select") as HTMLSelectElement, "all");

    expect(prompt(view)).toBeNull();
  });
});

describe("GlossarySection, removing a term", () => {
  const AFTER_CHECKOUT = without(FILE_BACKED_GLOSSARY, "checkout");

  it("asks first, names what is lost, and sends nothing on Cancel", async () => {
    const withContext: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [
        {
          ...sharedTerm("checkout", "Kasse"),
          note: "Payment step",
          partOfSpeech: "noun",
          caseSensitive: true,
        },
      ],
    };
    const view = await renderAsync(<GlossarySection glossary={withContext} onChange={() => {}} />);
    const remove = buttonNamed(view, "Remove checkout");
    remove.focus();

    await clickAsync(remove);

    const text = dialog(view)?.textContent ?? "";
    expect(text).toContain("Remove this term");
    expect(text).toContain("Kasse");
    expect(text).toContain("Payment step");
    expect(text).toContain("noun");
    expect(text).toContain("Match case");
    expect(rpcCalls).toEqual([]);

    await clickAsync(buttonNamed(view, "Cancel"));

    expect(dialog(view)).toBeNull();
    expect(rpcCalls).toEqual([]);
    expect(document.activeElement).toBe(remove);
  });

  it("ends on Escape without writing", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Remove checkout"));

    pressKey("Escape");

    expect(dialog(view)).toBeNull();
    expect(rpcCalls).toEqual([]);
  });

  it("ends on the close control without writing", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Remove checkout"));

    await clickAsync(buttonNamed(view, "Keep the term and close"));

    expect(dialog(view)).toBeNull();
    expect(rpcCalls).toEqual([]);
  });

  it("writes once on confirm, closes, and moves focus to the next term", async () => {
    stubRpc({ "glossary.write": writeAnswer(AFTER_CHECKOUT) });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Remove checkout"));

    await clickAsync(buttonNamed(view, "Remove term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "checkout", translation: null } },
    ]);
    expect(dialog(view)).toBeNull();
    expect(findNamed(view, "button", "Edit checkout")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(view, "Edit Dashboard"));
  });

  it("moves focus to the previous term when the last one goes, and to the add field when none is left", async () => {
    const two: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [sharedTerm("a", "A"), sharedTerm("b", "B")],
    };
    const one = { ...two, terms: [sharedTerm("a", "A")] };
    const none = { ...two, terms: [] };
    let step = 0;
    stubRpc({
      "glossary.write": () => writeAnswer([one, none][step++] ?? none),
    });
    const view = await renderAsync(<Stateful initial={two} />);

    await clickAsync(buttonNamed(view, "Remove b"));
    await clickAsync(buttonNamed(view, "Remove term"));
    expect(document.activeElement).toBe(buttonNamed(view, "Edit a"));

    await clickAsync(buttonNamed(view, "Remove a"));
    await clickAsync(buttonNamed(view, "Remove term"));
    expect(document.activeElement).toBe(textboxNamed(view, "New glossary term"));
  });

  it("follows the visible list, not the whole glossary, when a search is active", async () => {
    stubRpc({ "glossary.write": writeAnswer(AFTER_CHECKOUT) });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "Search terms"), "e");

    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));

    expect(document.activeElement).toBe(buttonNamed(view, "Edit Dashboard"));
  });

  it("ignores Escape and a second confirm while the write is in flight", async () => {
    const pending = deferredAnswer();
    stubRpc({ "glossary.write": () => pending.promise });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Remove checkout"));
    await clickAsync(buttonNamed(view, "Remove term"));

    pressKey("Escape");
    await clickAsync(buttonNamed(view, "Removing…"));

    expect(dialog(view)).not.toBeNull();
    expect(rpcCalls).toHaveLength(1);
    expect(buttonNamed(view, "Removing…").getAttribute("aria-disabled")).toBe("true");

    await act(async () => {
      pending.resolve(writeAnswer(AFTER_CHECKOUT));
      await flush();
    });
    expect(dialog(view)).toBeNull();
  });

  it("closes the dialog on a failed write, shows the failure on the row with Retry, and keeps focus on Remove", async () => {
    let answers = 0;
    stubRpc({
      "glossary.write": () =>
        answers++ === 0 ? rpcError("INTERNAL", "boom") : writeAnswer(AFTER_CHECKOUT),
    });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const remove = buttonNamed(view, "Remove checkout");
    remove.focus();
    await clickAsync(remove);
    await clickAsync(buttonNamed(view, "Remove term"));

    expect(dialog(view)).toBeNull();
    const row = view.get("[data-glossary-row]:nth-child(2)");
    expect(row.querySelector('[role="alert"]')?.textContent).toContain("unexpected server error");
    expect(document.activeElement).toBe(remove);

    await clickAsync(buttonNamed(view, "Retry"));

    expect(rpcCalls).toHaveLength(2);
    expect(findNamed(view, "button", "Edit checkout")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(view, "Edit Dashboard"));
  });

  it("hides Remove for a term with per-locale data and says why in visible text", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );

    expect(findNamed(view, "button", "Remove Dashboard")).toBeUndefined();
    const reason = view.get("[data-remove-reason]");
    expect(reason.textContent).toContain("cannot be removed while a locale holds its own");
    expect(reason.closest("[title]")).toBeNull();
  });

  it("says in locale scope that a term is removed from All locales", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    selectOption(view.get("select") as HTMLSelectElement, "de");

    expect(findNamed(view, "button", "Remove checkout")).toBeUndefined();
    expect(view.get("[data-remove-reason]").textContent).toContain("removed from All locales");
  });
});

describe("GlossarySection, clearing a translation", () => {
  const ONLY_SHARED_AFTER = without(FILE_BACKED_GLOSSARY, "checkout");

  it("asks before a Save that would remove the term, and keeps the editor and focus on Cancel", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "");
    const save = buttonNamed(view, "Save");
    save.focus();

    await clickAsync(save);

    expect(dialog(view)?.textContent).toContain("Clearing this translation removes the term");
    expect(rpcCalls).toEqual([]);

    await clickAsync(elementNamed(view, '[role="dialog"] button', "Cancel"));

    expect(dialog(view)).toBeNull();
    expect(textboxNamed(view, "Translation (all locales)").value).toBe("");
    expect(document.activeElement).toBe(save);
    expect(rpcCalls).toEqual([]);
  });

  it("removes the term on confirm and moves focus to the next term", async () => {
    stubRpc({ "glossary.write": writeAnswer(ONLY_SHARED_AFTER) });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "  ");
    await clickAsync(buttonNamed(view, "Save"));

    await clickAsync(buttonNamed(view, "Remove term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "checkout", translation: null } },
    ]);
    expect(findNamed(view, "button", "Edit checkout")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(view, "Edit Dashboard"));
  });

  it("keeps the editor and its draft when the confirmed write fails", async () => {
    stubRpc({ "glossary.write": rpcError("INTERNAL", "boom") });
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "");
    typeInto(textboxNamed(view, "Note"), "kept note");
    await clickAsync(buttonNamed(view, "Save"));
    await clickAsync(buttonNamed(view, "Remove term"));

    expect(dialog(view)).toBeNull();
    expect(textboxNamed(view, "Note").value).toBe("kept note");
    expect(view.get("[data-glossary-row]:nth-child(2) [role=alert]").textContent).toContain(
      "unexpected server error",
    );
  });

  it("writes without asking when other data keeps the term alive", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    await clickAsync(buttonNamed(view, "Edit Dashboard"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "");
    await clickAsync(buttonNamed(view, "Save"));

    expect(dialog(view)).toBeNull();
    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "Dashboard", translation: null } },
    ]);
  });

  it("asks when clearing a locale's last entry would leave nothing", async () => {
    const view = render(
      <GlossarySection
        glossary={{ ...FILE_BACKED_GLOSSARY, terms: [ONLY_GERMAN] }}
        onChange={() => {}}
      />,
    );
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Shop"));
    typeInto(textboxNamed(view, "Translation (de)"), "");
    await clickAsync(buttonNamed(view, "Save"));

    const text = dialog(view)?.textContent ?? "";
    expect(text).toContain("Clearing this translation removes the term");
    expect(text).toContain("Laden");
    expect(text).toContain("Storefront");
  });
});

describe("GlossarySection, removing a do-not-translate term", () => {
  const TWO: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    doNotTranslate: [
      { term: "Northwind", caseSensitive: true },
      { term: "Acme", caseSensitive: false },
    ],
  };
  const ONE: GlossaryGetResult = {
    ...TWO,
    doNotTranslate: [{ term: "Acme", caseSensitive: false }],
  };
  const NONE: GlossaryGetResult = { ...TWO, doNotTranslate: [] };

  it("asks first and names the term and its Match case setting", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );

    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));

    const text = dialog(view)?.textContent ?? "";
    expect(text).toContain("Stop keeping this term untranslated");
    expect(text).toContain("Northwind");
    expect(text).toContain("Match case setting is dropped");
    await clickAsync(buttonNamed(view, "Cancel"));
    expect(rpcCalls).toEqual([]);
  });

  it("moves focus to the next kept term after a confirmed removal, and to the input after the last", async () => {
    let current = TWO;
    stubRpc({
      "glossary.write": () => {
        current = current === TWO ? ONE : NONE;
        return writeAnswer(current);
      },
    });
    const view = await renderAsync(<Stateful initial={TWO} />);

    await clickAsync(buttonNamed(view, "Remove Northwind from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));
    expect(rpcCalls[0]).toEqual({
      method: "glossary.write",
      params: { term: "Northwind", doNotTranslate: false },
    });
    expect(document.activeElement).toBe(buttonNamed(view, "Remove Acme from do not translate"));

    await clickAsync(buttonNamed(view, "Remove Acme from do not translate"));
    await clickAsync(buttonNamed(view, "Stop keeping it"));
    expect(document.activeElement).toBe(textboxNamed(view, "New do-not-translate term"));
  });

  it("shows a failed removal with Retry and keeps focus on Remove", async () => {
    stubRpc({ "glossary.write": rpcError("INTERNAL", "boom") });
    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={() => {}} />,
    );
    const remove = buttonNamed(view, "Remove Northwind from do not translate");
    remove.focus();
    await clickAsync(remove);
    await clickAsync(buttonNamed(view, "Stop keeping it"));

    expect(dialog(view)).toBeNull();
    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
    expect(buttonNamed(view, "Retry")).toBeTruthy();
    expect(document.activeElement).toBe(remove);
  });
});

describe("GlossarySection, concurrent writes", () => {
  const THREE: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    terms: [sharedTerm("a", "A"), sharedTerm("b", "B")],
  };

  async function startEdit(view: RenderResult, term: string, value: string): Promise<void> {
    await clickAsync(buttonNamed(view, `Edit ${term}`));
    const fields = view.all('input[aria-label="Translation (all locales)"]');
    const field = fields[fields.length - 1] as HTMLInputElement;
    typeInto(field, value);
  }

  it("sends one write at a time, and the newest response is the last one applied", async () => {
    const first = deferredAnswer();
    const second = deferredAnswer();
    const answers = [first, second];
    stubRpc({
      "glossary.write": () => (answers.shift() as ReturnType<typeof deferredAnswer>).promise,
    });
    const applied: string[] = [];
    const view = await renderAsync(
      <Stateful
        initial={THREE}
        onChange={(next) => applied.push(next.terms.map((term) => term.target).join(","))}
      />,
    );

    await startEdit(view, "a", "A1");
    await clickAsync(buttonNamed(view, "Save"));
    await startEdit(view, "b", "B1");
    await clickAsync(elementNamed(view, "[data-glossary-row]:nth-child(2) button", "Save"));

    expect(rpcCalls).toHaveLength(1);

    await act(async () => {
      first.resolve(
        writeAnswer({ ...THREE, terms: [sharedTerm("a", "A1"), sharedTerm("b", "B")] }),
      );
      await flush();
      await flush();
      await flush();
    });
    expect(rpcCalls).toHaveLength(2);

    await act(async () => {
      second.resolve(
        writeAnswer({ ...THREE, terms: [sharedTerm("a", "A1"), sharedTerm("b", "B1")] }),
      );
      await flush();
    });

    expect(applied).toEqual(["A1,B", "A1,B1"]);
    expect(view.text()).toContain("B1");
  });

  it("keeps each row's busy state to itself while another row's write fails", async () => {
    const first = deferredAnswer();
    const second = deferredAnswer();
    const answers = [first, second];
    stubRpc({
      "glossary.write": () => (answers.shift() as ReturnType<typeof deferredAnswer>).promise,
    });
    const view = await renderAsync(<GlossarySection glossary={THREE} onChange={() => {}} />);

    await startEdit(view, "a", "A1");
    await clickAsync(elementNamed(view, "[data-glossary-row]:nth-child(1) button", "Save"));
    await startEdit(view, "b", "B1");
    await clickAsync(elementNamed(view, "[data-glossary-row]:nth-child(2) button", "Save"));
    const saves = view.all("[data-glossary-row] form button[type=submit]");
    expect(saves.map((save) => save.getAttribute("aria-disabled"))).toEqual(["true", "true"]);

    await act(async () => {
      first.resolve(rpcError("INTERNAL", "boom"));
      await flush();
    });

    const rows = view.all("[data-glossary-row]");
    expect(rows[0]?.querySelector('[role="alert"]')).not.toBeNull();
    expect(rows[1]?.querySelector('[role="alert"]')).toBeNull();
    expect(rows[1]?.querySelector("form button[type=submit]")?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(
      rows[0]?.querySelector("form button[type=submit]")?.getAttribute("aria-disabled"),
    ).toBeNull();

    await act(async () => {
      second.resolve(writeAnswer(THREE));
      await flush();
    });
    expect(
      view.all("[data-glossary-row] form button[type=submit]")[0]?.getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("repeats a failed write on Retry, keeps Retry focused and inert while it runs, and clears the failure on success", async () => {
    const retry = deferredAnswer();
    let calls = 0;
    stubRpc({
      "glossary.write": () => (calls++ === 0 ? rpcError("LOCK_CONTENDED", "busy") : retry.promise),
    });
    const view = await renderAsync(<GlossarySection glossary={THREE} onChange={() => {}} />);
    await startEdit(view, "a", "A1");
    await clickAsync(buttonNamed(view, "Save"));
    const again = buttonNamed(view, "Retry");
    again.focus();

    await clickAsync(again);

    expect(buttonNamed(view, "Retrying…").getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(buttonNamed(view, "Retrying…"));
    await clickAsync(buttonNamed(view, "Retrying…"));
    expect(rpcCalls).toHaveLength(2);

    await act(async () => {
      retry.resolve(writeAnswer(THREE));
      await flush();
    });
    expect(view.query('[role="alert"]')).toBeNull();
    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(view, "Edit a"));
  });

  it("offers no Retry for a failure that repeating cannot fix", async () => {
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "A glossary term must not be blank.") });
    const view = await renderAsync(<GlossarySection glossary={THREE} onChange={() => {}} />);
    await startEdit(view, "a", "A1");
    await clickAsync(buttonNamed(view, "Save"));

    expect(view.get('[role="alert"]').textContent).toContain("A glossary term must not be blank.");
    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("drops a row's old failure when its editor is cancelled", async () => {
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "nope") });
    const view = await renderAsync(<GlossarySection glossary={THREE} onChange={() => {}} />);
    await startEdit(view, "a", "A1");
    await clickAsync(buttonNamed(view, "Save"));
    expect(view.query('[role="alert"]')).not.toBeNull();

    await clickAsync(buttonNamed(view, "Cancel"));

    expect(view.query('[role="alert"]')).toBeNull();
  });
});
