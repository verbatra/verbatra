// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  GlossaryGetResult,
  GlossaryTermView,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import type { RenderResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  DASHBOARD_TERM,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  findNamed,
  flush,
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

function Stateful({ initial }: { readonly initial: GlossaryGetResult }): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return <GlossarySection glossary={glossary} onChange={setGlossary} />;
}

function section(glossary: GlossaryGetResult = FILE_BACKED_GLOSSARY): ReactNode {
  return <GlossarySection glossary={glossary} onChange={() => {}} />;
}

function visibleLabel(view: RenderResult, input: HTMLInputElement): string | null {
  return view.get(`label[for="${input.id}"]`).textContent;
}

function showLocale(view: RenderResult, locale: string): void {
  selectOption(view.get("select") as HTMLSelectElement, locale);
}

function arabic(source: string, target: string): GlossaryTermView {
  return {
    source,
    targets: { ar: target },
    forbidden: {},
    caseSensitive: false,
    byLocale: { ar: { target, inherited: false, forbidden: [] } },
  };
}

const ARABIC_GLOSSARY: GlossaryGetResult = {
  ...FILE_BACKED_GLOSSARY,
  locales: ["ar", "de"],
  terms: [arabic("Cart", "عربة التسوق {count}"), sharedTerm("Plain", "Einfach")],
  doNotTranslate: [],
};

describe("GlossarySection, file-backed", () => {
  it("offers edit actions, removal for shared-only terms, and the add forms", async () => {
    const view = await renderAsync(section());

    expect(buttonNamed(view, "Edit verbatra")).toBeTruthy();
    expect(buttonNamed(view, "Remove checkout")).toBeTruthy();
    expect(findNamed(view, "button", "Remove Dashboard")).toBeUndefined();
    expect(textboxNamed(view, "New glossary term")).toBeTruthy();
    expect(textboxNamed(view, "New do-not-translate term")).toBeTruthy();
  });

  it("shows every locale's own translation in the all-locales view, with the term's badges and note", async () => {
    const view = await renderAsync(section());

    expect(view.text()).toContain("Übersicht");
    expect(view.text()).toContain("noun");
    expect(view.text()).toContain("Match case");
    expect(view.text()).toContain("The start page after sign-in");
    expect(view.text()).not.toContain("Never use");
  });

  it("shows a locale's resolved translation, its forbidden renderings, and what is inherited", async () => {
    const view = render(section());
    showLocale(view, "de");

    expect(view.text()).toContain("Never use");
    expect(view.text()).toContain("Instrumententafel");

    showLocale(view, "fr");

    expect(view.text()).toContain("inherited from all locales");
    expect(view.text()).not.toContain("Instrumententafel");
  });

  it("says when a locale has no translation for a term", async () => {
    const onlyForbidden: GlossaryTermView = {
      source: "Board",
      targets: {},
      forbidden: { fr: ["Planche"] },
      caseSensitive: false,
      byLocale: { fr: { inherited: true, forbidden: ["Planche"] } },
    };
    const view = render(section({ ...FILE_BACKED_GLOSSARY, terms: [onlyForbidden] }));

    expect(view.text()).toContain("No translation for all locales");
    showLocale(view, "fr");
    expect(view.text()).toContain("No translation for fr");
  });

  it("labels the locale selector by its visible text", async () => {
    const view = await renderAsync(section());
    const select = view.get("select");

    expect(select.hasAttribute("aria-label")).toBe(false);
    expect(view.get(`label[for="${select.id}"]`).textContent).toBe("Show translations for");
  });

  it("shows each locale's own translation with its code and counts the never-use rules", async () => {
    const view = await renderAsync(section());

    expect(view.text()).toContain("1 never-use rule; choose a locale to see them");
    expect(view.all("[data-tone=neutral]").some((badge) => badge.textContent === "de")).toBe(true);
    expect(view.text()).not.toContain("not target locales");
  });

  it("marks a stored locale that is not a target locale as read-only", async () => {
    const regional: GlossaryTermView = {
      ...DASHBOARD_TERM,
      targets: { "de-AT": "Armaturenbrett" },
      forbidden: {},
    };
    const view = await renderAsync(section({ ...FILE_BACKED_GLOSSARY, terms: [regional] }));

    expect(view.text()).toContain("Armaturenbrett");
    expect(view.text()).toContain("not target locales of this project");
  });

  it("neither edits, removes, nor shows the real value of a term the server redacted", async () => {
    const redacted: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [sharedTerm("apiTerm", "[REDACTED]")],
      redactedTerms: ["apiTerm"],
    };

    const view = await renderAsync(section(redacted));

    expect(findNamed(view, "button", "Edit apiTerm")).toBeUndefined();
    expect(findNamed(view, "button", "Remove apiTerm")).toBeUndefined();
    expect(view.text()).toContain("looks like a secret");
  });

  it("shows long unbroken values in full, with no tooltip on text that cannot take focus", async () => {
    const long = "x".repeat(300);
    const view = render(
      section({
        ...FILE_BACKED_GLOSSARY,
        terms: [
          {
            ...DASHBOARD_TERM,
            source: long,
            note: long,
            byLocale: { de: { target: long, inherited: false, forbidden: [long] } },
          },
        ],
      }),
    );
    showLocale(view, "de");

    const holders = view.all("*").filter((node) => node.children.length === 0);
    expect(holders.filter((node) => node.textContent === long).length).toBeGreaterThanOrEqual(3);
    expect(view.all("[title]")).toHaveLength(0);
  });
});

describe("GlossarySection, adding a term", () => {
  it("adds a term for all locales through one write with trimmed values, and hands the new state back", async () => {
    const next: GlossaryWriteResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("cart", "Warenkorb")],
    };
    stubRpc({ "glossary.write": writeAnswer(next) });
    const onChange = vi.fn();

    const view = await renderAsync(
      <GlossarySection glossary={FILE_BACKED_GLOSSARY} onChange={onChange} />,
    );
    typeInto(textboxNamed(view, "New glossary term"), "  cart  ");
    typeInto(textboxNamed(view, "New glossary translation"), "  Warenkorb  ");
    await clickAsync(buttonNamed(view, "Add term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "cart", translation: "Warenkorb" } },
    ]);
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it("empties the form and returns focus to the first field after an add", async () => {
    const next: GlossaryWriteResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [...FILE_BACKED_GLOSSARY.terms, sharedTerm("cart", "Warenkorb")],
    };
    stubRpc({ "glossary.write": writeAnswer(next) });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);

    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Warenkorb");
    await clickAsync(buttonNamed(view, "Add term"));

    expect(textboxNamed(view, "New glossary term").value).toBe("");
    expect(textboxNamed(view, "New glossary translation").value).toBe("");
    expect(document.activeElement).toBe(textboxNamed(view, "New glossary term"));
  });

  it("submits on Enter, like the button", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Warenkorb");

    act(() => {
      view.get("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(rpcCalls).toHaveLength(1);
  });

  it("adds a term for the locale being shown", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });

    const view = render(section());
    showLocale(view, "fr");
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Panier");
    await clickAsync(buttonNamed(view, "Add term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "cart", translation: "Panier", locale: "fr" } },
    ]);
  });

  it("keeps the add form filled when the write fails and shows the failure next to the form", async () => {
    stubRpc({ "glossary.write": rpcError("CONFIG_INVALID", "the glossary would be invalid") });

    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Warenkorb");
    await clickAsync(buttonNamed(view, "Add term"));

    expect(textboxNamed(view, "New glossary term").value).toBe("cart");
    expect(textboxNamed(view, "New glossary translation").value).toBe("Warenkorb");
    const alert = view.get('[role="alert"]');
    expect(alert.textContent).toContain("the glossary would be invalid");
    expect(alert.closest("[data-glossary-row]")).toBeNull();
    expect(findNamed(view, "button", "Retry")).toBeUndefined();
  });

  it("offers Retry for a transient failure and clears the form once the repeat succeeds", async () => {
    let answered = false;
    stubRpc({
      "glossary.write": () => {
        const ok = answered;
        answered = true;
        return ok
          ? writeAnswer(FILE_BACKED_GLOSSARY)
          : rpcError("GLOSSARY_UNWRITABLE", "the file is locked");
      },
    });
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "cart");
    typeInto(textboxNamed(view, "New glossary translation"), "Warenkorb");
    await clickAsync(buttonNamed(view, "Add term"));
    expect(view.get('[role="alert"]').textContent).toContain("could not be written");

    await clickAsync(buttonNamed(view, "Retry"));

    expect(rpcCalls).toHaveLength(2);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(textboxNamed(view, "New glossary term").value).toBe("");
  });

  it("says a term already exists in the scope, offers Edit, and sends nothing", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "checkout");
    typeInto(textboxNamed(view, "New glossary translation"), "Bezahlen");

    const note = view.get("[data-exists-note]");
    expect(note.textContent).toContain("checkout is already in the glossary");
    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(true);

    await clickAsync(note.querySelector("button") as HTMLElement);

    expect(textboxNamed(view, "Translation (all locales)").value).toBe("Kasse");
    expect(rpcCalls).toEqual([]);
  });

  it("matches an existing source exactly, so a differently cased term is a new term", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "Checkout");
    typeInto(textboxNamed(view, "New glossary translation"), "Bezahlen");

    expect(view.query("[data-exists-note]")).toBeNull();
    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not call a term existing in a scope where it has no translation of its own", async () => {
    const view = render(section());
    showLocale(view, "fr");
    typeInto(textboxNamed(view, "New glossary term"), "Dashboard");
    typeInto(textboxNamed(view, "New glossary translation"), "Tableau de bord");

    expect(view.query("[data-exists-note]")).toBeNull();

    const german = render(section());
    showLocale(german, "de");
    typeInto(textboxNamed(german, "New glossary term"), "Dashboard");
    typeInto(textboxNamed(german, "New glossary translation"), "Start");
    expect(german.query("[data-exists-note]")).not.toBeNull();
  });

  it("says an existing redacted term cannot be edited here", async () => {
    const redacted: GlossaryGetResult = {
      ...FILE_BACKED_GLOSSARY,
      terms: [sharedTerm("apiTerm", "[REDACTED]")],
      redactedTerms: ["apiTerm"],
    };
    const view = await renderAsync(section(redacted));
    typeInto(textboxNamed(view, "New glossary term"), "apiTerm");
    typeInto(textboxNamed(view, "New glossary translation"), "x");

    const note = view.get("[data-exists-note]");
    expect(note.textContent).toContain("cannot be edited here");
    expect(note.querySelector("button")).toBeNull();
  });

  it("refuses a term longer than the cap and says why", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "a".repeat(201));
    typeInto(textboxNamed(view, "New glossary translation"), "x");

    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(true);
    expect(view.get("[data-cap-note]").textContent).toContain("at most 200 characters");
  });

  it("measures a padded term at the cap by its trimmed length, the one it sends", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), ` ${"a".repeat(200)} `);
    typeInto(textboxNamed(view, "New glossary translation"), "x");
    typeInto(textboxNamed(view, "New do-not-translate term"), ` ${"b".repeat(200)} `);

    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(false);
    expect((buttonNamed(view, "Keep untranslated") as HTMLButtonElement).disabled).toBe(false);
    expect(view.query("[data-cap-note]")).toBeNull();
  });

  it("caps the translation at the schema limit and says so when it is reached", async () => {
    const view = await renderAsync(section());
    const field = textboxNamed(view, "New glossary translation");
    typeInto(field, "x".repeat(2_000));

    expect(field.maxLength).toBe(2_000);
    expect(view.get("[data-cap-note]").textContent).toContain("limit of 2000 characters");
  });

  it("refuses to submit an add form that is missing either half", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New glossary term"), "cart");

    expect((buttonNamed(view, "Add term") as HTMLButtonElement).disabled).toBe(true);
  });

  it("gives the new source term an automatic direction", async () => {
    const view = await renderAsync(section());

    expect(textboxNamed(view, "New glossary term").getAttribute("dir")).toBe("auto");
  });
});

describe("GlossarySection, editing a term", () => {
  it("edits a locale's translation, forbidden renderings and the term's context in one write", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });

    const view = render(section());
    showLocale(view, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));
    expect(textboxNamed(view, "Translation (de)").value).toBe("Übersicht");
    typeInto(textboxNamed(view, "Translation (de)"), "Startseite");
    typeInto(textboxNamed(view, "Never use (de)"), "Instrumententafel, Tafel");
    typeInto(textboxNamed(view, "Part of speech"), "");
    await clickAsync(buttonNamed(view, "Save"));

    expect(rpcCalls).toEqual([
      {
        method: "glossary.write",
        params: {
          term: "Dashboard",
          translation: "Startseite",
          locale: "de",
          forbidden: ["Instrumententafel", "Tafel"],
          partOfSpeech: null,
        },
      },
    ]);
  });

  it("splits never-use renderings on the Arabic comma as well", async () => {
    stubRpc({ "glossary.write": writeAnswer(ARABIC_GLOSSARY) });
    const view = render(section(ARABIC_GLOSSARY));
    showLocale(view, "ar");
    await clickAsync(buttonNamed(view, "Edit Cart"));
    typeInto(textboxNamed(view, "Never use (ar)"), "سلة، حقيبة");
    await clickAsync(buttonNamed(view, "Save"));

    expect(rpcCalls).toEqual([
      {
        method: "glossary.write",
        params: { term: "Cart", locale: "ar", forbidden: ["سلة", "حقيبة"] },
      },
    ]);
  });

  it("changes case sensitivity from the all-locales editor", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });

    const view = await renderAsync(section());
    await clickAsync(buttonNamed(view, "Edit checkout"));
    expect(findNamed(view, "input", "Never use (all locales)")).toBeUndefined();
    await clickAsync(elementNamed(view, "input", "Match case for checkout"));
    await clickAsync(buttonNamed(view, "Save"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "checkout", caseSensitive: true } },
    ]);
  });

  it("will not save an editor that changes nothing, and abandons it on cancel", async () => {
    const view = await renderAsync(section());
    await clickAsync(buttonNamed(view, "Edit checkout"));

    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);

    await clickAsync(buttonNamed(view, "Cancel"));

    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
    expect(rpcCalls).toEqual([]);
  });

  it("labels every editor field visibly and groups them by locale and whole term", async () => {
    const view = render(section());
    showLocale(view, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));

    expect(view.all("legend").map((legend) => legend.textContent)).toEqual([
      "Filter terms",
      "For de",
      "Whole term",
    ]);
    expect(visibleLabel(view, textboxNamed(view, "Translation (de)"))).toBe("Translation");
    expect(visibleLabel(view, textboxNamed(view, "Never use (de)"))).toBe("Never use");
    for (const text of ["Note", "Part of speech"]) {
      expect(textboxNamed(view, text).hasAttribute("aria-label")).toBe(false);
    }
  });

  it("moves focus into the translation field on edit and back to Edit on cancel or save", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);

    await clickAsync(buttonNamed(view, "Edit checkout"));
    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));

    await clickAsync(buttonNamed(view, "Cancel"));
    expect(document.activeElement).toBe(buttonNamed(view, "Edit checkout"));

    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Bezahlung");
    await clickAsync(buttonNamed(view, "Save"));
    expect(document.activeElement).toBe(buttonNamed(view, "Edit checkout"));
  });

  it("cancels an open editor on Escape", async () => {
    const view = await renderAsync(section());
    await clickAsync(buttonNamed(view, "Edit checkout"));

    const field = textboxNamed(view, "Translation (all locales)");
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(findNamed(view, "input", "Translation (all locales)")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(view, "Edit checkout"));
  });

  it("says why the translation is at its limit and refuses more than fifty never-use renderings", async () => {
    const view = render(section());
    showLocale(view, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));
    typeInto(
      textboxNamed(view, "Never use (de)"),
      Array.from({ length: 51 }, (_, index) => `r${index}`).join(", "),
    );

    expect(view.get("[data-cap-note]").textContent).toContain("At most 50 never-use renderings");
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(true);

    typeInto(
      textboxNamed(view, "Never use (de)"),
      Array.from({ length: 50 }, (_, index) => `r${index}`).join(", "),
    );

    expect(view.query("[data-cap-note]")).toBeNull();
    expect((buttonNamed(view, "Save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks the translation, note and part of speech fields at their limits", async () => {
    const view = await renderAsync(section());
    await clickAsync(buttonNamed(view, "Edit Dashboard"));
    typeInto(textboxNamed(view, "Note"), "n".repeat(500));
    typeInto(textboxNamed(view, "Part of speech"), "p".repeat(50));

    expect(view.all("[data-cap-note]").map((note) => note.textContent)).toEqual([
      "A note is at its limit of 500 characters.",
      "A part of speech is at its limit of 50 characters.",
    ]);
  });
});

describe("GlossarySection, in-flight writes", () => {
  it("keeps the row's own actions focusable but inert while its write is in flight", async () => {
    stubRpc({ "glossary.write": () => new Promise(() => {}) });

    const view = render(section());
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Bezahlung");
    const save = buttonNamed(view, "Save");
    save.focus();
    await clickAsync(save);

    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(save);
    expect(textboxNamed(view, "Translation (all locales)").readOnly).toBe(true);
    await clickAsync(save);
    expect(rpcCalls).toHaveLength(1);
    expect(buttonNamed(view, "Edit verbatra").getAttribute("aria-disabled")).toBeNull();
  });
});

describe("GlossarySection, search", () => {
  const MANY: GlossaryGetResult = {
    ...FILE_BACKED_GLOSSARY,
    terms: Array.from({ length: 500 }, (_, index) => sharedTerm(`term-${index}`, `Wert ${index}`)),
  };

  it("lists every term of a long glossary and narrows it by source, translation or note", async () => {
    const view = await renderAsync(section(MANY));

    expect(view.all("[data-glossary-row]")).toHaveLength(500);
    expect(view.get('[role="status"]').textContent).toBe("500 terms");

    typeInto(textboxNamed(view, "Search terms"), "term-49");
    expect(view.all("[data-glossary-row]")).toHaveLength(11);
    expect(view.get('[role="status"]').textContent).toBe("11 of 500 terms");

    typeInto(textboxNamed(view, "Search terms"), "wert 3");
    expect(view.all("[data-glossary-row]").length).toBeGreaterThan(1);
  });

  it("says nothing matches and clears the search from the empty state", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "Search terms"), "zzz");

    expect(view.text()).toContain("No terms match");
    expect(view.all("[data-glossary-row]")).toHaveLength(0);

    await clickAsync(buttonNamed(view, "Clear search"));

    expect(view.all("[data-glossary-row]")).toHaveLength(3);
    expect(textboxNamed(view, "Search terms").value).toBe("");
  });

  it("finds an Arabic value", async () => {
    const view = await renderAsync(section(ARABIC_GLOSSARY));
    typeInto(textboxNamed(view, "Search terms"), "عربة");

    expect(view.all("[data-glossary-row]")).toHaveLength(1);
  });

  it("keeps a row that is being edited in the list when the search stops matching it", async () => {
    const view = await renderAsync(section());
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Search terms"), "verbatra");

    expect(view.all("[data-glossary-row]")).toHaveLength(2);
    expect(textboxNamed(view, "Translation (all locales)")).toBeTruthy();
  });

  it("puts the scope selector in the same filter group as the search", async () => {
    const view = await renderAsync(section());
    const group = view.get("fieldset");

    expect(group.contains(textboxNamed(view, "Search terms"))).toBe(true);
    expect(group.contains(view.get("select"))).toBe(true);
    expect(group.querySelector("legend")?.textContent).toBe("Filter terms");
  });
});

describe("GlossarySection, right to left and placeholders", () => {
  it("renders a locale's value with its language, direction and an isolated placeholder", async () => {
    const view = render(section(ARABIC_GLOSSARY));
    showLocale(view, "ar");

    const value = view.get('[lang="ar"]');
    expect(value.getAttribute("dir")).toBe("rtl");
    expect(value.textContent).toContain("عربة التسوق");
    const token = value.querySelector("bdi");
    expect(token?.textContent).toBe("{count}");
    expect(token?.getAttribute("dir")).toBe("ltr");
  });

  it("renders a per-locale override in the all-locales view with its own language", async () => {
    const view = render(section(ARABIC_GLOSSARY));

    expect(view.get('[lang="ar"]').getAttribute("dir")).toBe("rtl");
  });

  it("keeps an automatic direction for the shared translation and the note", async () => {
    const view = render(
      section({
        ...FILE_BACKED_GLOSSARY,
        terms: [{ ...sharedTerm("Shop", "متجر"), note: "ملاحظة" }],
      }),
    );

    const auto = view.all('[dir="auto"]').map((node) => node.textContent);
    expect(auto).toContain("متجر");
    expect(auto).toContain("ملاحظة");
  });

  it("renders never-use renderings in the scope's language", async () => {
    const view = render(
      section({
        ...ARABIC_GLOSSARY,
        terms: [
          {
            source: "Cart",
            targets: { ar: "عربة" },
            forbidden: { ar: ["سلة {count}"] },
            caseSensitive: false,
            byLocale: { ar: { target: "عربة", inherited: false, forbidden: ["سلة {count}"] } },
          },
        ],
      }),
    );
    showLocale(view, "ar");

    const rendering = view.all('[lang="ar"]').find((node) => node.textContent === "سلة {count}");
    expect(rendering?.getAttribute("dir")).toBe("rtl");
  });
});

describe("GlossarySection, do-not-translate terms", () => {
  it("lists the kept terms", async () => {
    const view = await renderAsync(section());

    expect(view.text()).toContain("Northwind");
    expect(view.text()).toContain("Match case");
  });

  it("shows Match case on a kept term only when it is on", async () => {
    const view = await renderAsync(
      section({
        ...FILE_BACKED_GLOSSARY,
        terms: [],
        doNotTranslate: [
          { term: "Northwind", caseSensitive: true },
          { term: "Acme", caseSensitive: false },
        ],
      }),
    );
    const items = view.all("ul li").map((item) => item.textContent ?? "");

    expect(items.find((text) => text.includes("Northwind"))).toContain("Match case");
    expect(items.find((text) => text.includes("Acme"))).not.toContain("Match case");
  });

  it("keeps a new term untranslated, matching case unless told otherwise, and refocuses the field", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED_GLOSSARY) });

    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New do-not-translate term"), " Acme ");
    await clickAsync(buttonNamed(view, "Keep untranslated"));
    expect(document.activeElement).toBe(textboxNamed(view, "New do-not-translate term"));
    typeInto(textboxNamed(view, "New do-not-translate term"), "Contoso");
    await clickAsync(elementNamed(view, "input", "Match case for the new do-not-translate term"));
    await clickAsync(buttonNamed(view, "Keep untranslated"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "Acme", doNotTranslate: true } },
      {
        method: "glossary.write",
        params: { term: "Contoso", doNotTranslate: true, caseSensitive: false },
      },
    ]);
    expect(textboxNamed(view, "New do-not-translate term").value).toBe("");
    expect(
      (
        elementNamed(
          view,
          "input",
          "Match case for the new do-not-translate term",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("will not flip an existing entry silently and says it is already kept", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New do-not-translate term"), "Northwind");

    expect(view.get("[data-exists-note]").textContent).toContain("already kept untranslated");
    expect((buttonNamed(view, "Keep untranslated") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says an existing entry without case matching is kept without Match case", async () => {
    const view = await renderAsync(
      section({
        ...FILE_BACKED_GLOSSARY,
        doNotTranslate: [{ term: "Acme", caseSensitive: false }],
      }),
    );
    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");

    expect(view.get("[data-exists-note]").textContent).toContain("without Match case");
  });

  it("refuses a do-not-translate term longer than the cap and says why", async () => {
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New do-not-translate term"), "b".repeat(201));

    expect(view.get("[data-cap-note]").textContent).toContain("at most 200 characters");
    expect((buttonNamed(view, "Keep untranslated") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a failed keep next to the form and offers Retry", async () => {
    stubRpc({ "glossary.write": rpcError("INTERNAL", "boom") });
    const view = await renderAsync(section());
    typeInto(textboxNamed(view, "New do-not-translate term"), "Acme");
    await clickAsync(buttonNamed(view, "Keep untranslated"));

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
    expect(textboxNamed(view, "New do-not-translate term").value).toBe("Acme");
    expect(buttonNamed(view, "Retry")).toBeTruthy();
  });

  it("invites the first kept term when there is none yet", async () => {
    const view = await renderAsync(section({ ...FILE_BACKED_GLOSSARY, doNotTranslate: [] }));

    expect(view.text()).toContain("No term is kept untranslated yet");
  });
});

describe("GlossarySection, not file-backed", () => {
  it("explains an inline glossary and offers no way to change it, only to search it", async () => {
    const view = await renderAsync(
      section({ ...FILE_BACKED_GLOSSARY, indicator: { source: "inline" } }),
    );

    expect(view.text()).toContain("written inline in the verbatra config");
    expect(view.all("button")).toHaveLength(0);
    expect(view.all("input").map((input) => input.getAttribute("aria-label"))).toEqual([
      "Search terms",
    ]);
    expect(view.text()).toContain("Northwind");
  });

  it("explains a project with no glossary and offers no way to create one from here", async () => {
    const view = await renderAsync(
      section({
        indicator: { source: "none" },
        version: null,
        locales: ["de"],
        terms: [],
        doNotTranslate: [],
        redactedTerms: [],
      }),
    );

    expect(view.text()).toContain("no glossary yet");
    expect(view.text()).toContain("There is no glossary to show.");
    expect(view.all("button")).toHaveLength(0);
    expect(view.query("select")).toBeNull();
    expect(view.query("input")).toBeNull();
    expect(view.text()).not.toContain("Do not translate");
  });

  it("invites the first term of an empty glossary file, and an inline one just says it is empty", async () => {
    const empty: GlossaryGetResult = { ...FILE_BACKED_GLOSSARY, terms: [], doNotTranslate: [] };
    const file = await renderAsync(section(empty));
    expect(file.text()).toContain("Add the first one below");

    const inline = await renderAsync(section({ ...empty, indicator: { source: "inline" } }));
    expect(inline.text()).toContain("The inline glossary in the config holds no terms.");
  });

  it("says nothing about read-only for a file-backed glossary", async () => {
    const view = await renderAsync(section());

    expect(view.text()).not.toContain("written inline");
  });
});
