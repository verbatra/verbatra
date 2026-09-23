// @vitest-environment jsdom
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  GlossaryGetResult,
  GlossaryTermView,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import type { RenderResult } from "./test-support.js";
import {
  clickAsync,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  selectOption,
  stubRpc,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function Stateful({ initial }: { readonly initial: GlossaryGetResult }): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return <GlossarySection glossary={glossary} onChange={setGlossary} />;
}

function sharedTerm(source: string, target: string): GlossaryTermView {
  return {
    source,
    target,
    targets: {},
    forbidden: {},
    caseSensitive: false,
    byLocale: {
      de: { target, inherited: true, forbidden: [] },
      fr: { target, inherited: true, forbidden: [] },
    },
  };
}

const DASHBOARD: GlossaryTermView = {
  source: "Dashboard",
  target: "Dashboard",
  targets: { de: "Übersicht" },
  forbidden: { de: ["Instrumententafel"] },
  caseSensitive: true,
  note: "The start page after sign-in",
  partOfSpeech: "noun",
  byLocale: {
    de: { target: "Übersicht", inherited: false, forbidden: ["Instrumententafel"] },
    fr: { target: "Dashboard", inherited: true, forbidden: [] },
  },
};

const FILE_BACKED: GlossaryGetResult = {
  indicator: { source: "file", path: "glossary.json" },
  version: 2,
  locales: ["de", "fr"],
  terms: [sharedTerm("verbatra", "Verbatra"), sharedTerm("checkout", "Kasse"), DASHBOARD],
  doNotTranslate: [{ term: "Northwind", caseSensitive: true }],
  redactedTerms: [],
};

function writeAnswer(result: GlossaryWriteResult): {
  readonly ok: true;
  readonly result: GlossaryWriteResult;
} {
  return { ok: true, result };
}

function buttonLabeled(view: RenderResult, label: string): HTMLElement {
  return view.get(`button[aria-label="${label}"]`);
}

function field(view: RenderResult, label: string): HTMLInputElement {
  return view.get(`input[aria-label="${label}"]`) as HTMLInputElement;
}

function labeled(view: RenderResult, name: string): HTMLInputElement {
  const byName = view.query(`input[aria-label="${name}"]`);
  if (byName !== null) {
    return byName as HTMLInputElement;
  }
  const label = view.all("label").find((candidate) => candidate.textContent === name);
  const id = label?.getAttribute("for");
  if (id === null || id === undefined) {
    throw new Error(`no field named "${name}"`);
  }
  return view.get(`[id="${id}"]`) as HTMLInputElement;
}

function visibleLabel(view: RenderResult, input: HTMLInputElement): string | null {
  return view.get(`label[for="${input.id}"]`).textContent;
}

async function showLocale(view: RenderResult, locale: string): Promise<void> {
  selectOption(view.get("select") as HTMLSelectElement, locale);
  await clickAsync(view.get("ul"));
}

describe("GlossarySection, file-backed", () => {
  it("offers edit actions, removal for shared-only terms, and the add forms", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    expect(buttonLabeled(view, "Edit verbatra")).toBeTruthy();
    expect(buttonLabeled(view, "Remove checkout")).toBeTruthy();
    expect(view.query('button[aria-label="Remove Dashboard"]')).toBeNull();
    expect(field(view, "New glossary term")).toBeTruthy();
    expect(field(view, "New do-not-translate term")).toBeTruthy();
  });

  it("shows every locale's own translation in the all-locales view, with the term's badges and note", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    expect(view.text()).toContain("Übersicht");
    expect(view.text()).toContain("noun");
    expect(view.text()).toContain("Match case");
    expect(view.text()).toContain("The start page after sign-in");
    expect(view.text()).not.toContain("Never use");
  });

  it("shows a locale's resolved translation, its forbidden renderings, and what is inherited", async () => {
    const view = render(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await showLocale(view, "de");

    expect(view.text()).toContain("Never use");
    expect(view.text()).toContain("Instrumententafel");

    await showLocale(view, "fr");

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
    const view = render(
      <GlossarySection glossary={{ ...FILE_BACKED, terms: [onlyForbidden] }} onChange={() => {}} />,
    );

    expect(view.text()).toContain("No translation for all locales");
    await showLocale(view, "fr");
    expect(view.text()).toContain("No translation for fr");
  });

  it("adds a term for all locales through one write and hands the new state back", async () => {
    const next: GlossaryWriteResult = {
      ...FILE_BACKED,
      terms: [...FILE_BACKED.terms, sharedTerm("cart", "Warenkorb")],
    };
    stubRpc({ "glossary.write": writeAnswer(next) });
    const onChange = vi.fn();

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={onChange} />);
    typeInto(field(view, "New glossary term"), "  cart  ");
    typeInto(field(view, "New glossary translation"), "Warenkorb");
    await clickAsync(view.getByText("button", "Add term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "cart", translation: "Warenkorb" } },
    ]);
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it("adds a term for the locale being shown", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });

    const view = render(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await showLocale(view, "fr");
    typeInto(field(view, "New glossary term"), "cart");
    typeInto(field(view, "New glossary translation"), "Panier");
    await clickAsync(view.getByText("button", "Add term"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "cart", translation: "Panier", locale: "fr" } },
    ]);
  });

  it("keeps the add form filled when the write fails and shows why", async () => {
    stubRpc({ "glossary.write": rpcError("GLOSSARY_UNWRITABLE", "the file is read only") });

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    typeInto(field(view, "New glossary term"), "cart");
    typeInto(field(view, "New glossary translation"), "Warenkorb");
    await clickAsync(view.getByText("button", "Add term"));

    expect(field(view, "New glossary term").value).toBe("cart");
    expect(view.get('[role="alert"]').textContent).toContain("could not be written");
  });

  it("labels the locale selector by its visible text", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    const select = view.get("select");

    expect(select.hasAttribute("aria-label")).toBe(false);
    expect(view.get(`label[for="${select.id}"]`).textContent).toBe("Show translations for");
  });

  it("refuses a term longer than the cap", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    typeInto(field(view, "New glossary term"), "a".repeat(201));
    typeInto(field(view, "New glossary translation"), "x");

    expect(view.getByText("button", "Add term").hasAttribute("disabled")).toBe(true);
  });

  it("refuses to submit an add form that is missing either half", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    typeInto(field(view, "New glossary term"), "cart");

    expect(view.getByText("button", "Add term").hasAttribute("disabled")).toBe(true);
  });

  it("edits a locale's translation, forbidden renderings and the term's context in one write", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });

    const view = render(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await showLocale(view, "de");
    await clickAsync(buttonLabeled(view, "Edit Dashboard"));
    expect(labeled(view, "Translation (de)").value).toBe("Übersicht");
    typeInto(labeled(view, "Translation (de)"), "Startseite");
    typeInto(labeled(view, "Never use (de)"), "Instrumententafel, Tafel");
    typeInto(labeled(view, "Part of speech"), "");
    await clickAsync(view.getByText("button", "Save"));

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

  it("changes case sensitivity from the all-locales editor", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await clickAsync(buttonLabeled(view, "Edit checkout"));
    expect(view.all("label").some((label) => label.textContent?.startsWith("Never use"))).toBe(
      false,
    );
    await clickAsync(view.get('input[aria-label="Match case for checkout"]'));
    await clickAsync(view.getByText("button", "Save"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "checkout", caseSensitive: true } },
    ]);
  });

  it("will not save an editor that changes nothing, and abandons it on cancel", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await clickAsync(buttonLabeled(view, "Edit checkout"));

    expect(view.getByText("button", "Save").hasAttribute("disabled")).toBe(true);

    await clickAsync(view.getByText("button", "Cancel"));

    expect(
      view.all("label").some((label) => label.textContent === "Translation (all locales)"),
    ).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("labels every editor field visibly and groups them by locale and whole term", async () => {
    const view = render(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await showLocale(view, "de");
    await clickAsync(buttonLabeled(view, "Edit Dashboard"));

    expect(view.all("legend").map((legend) => legend.textContent)).toEqual([
      "For de",
      "Whole term",
    ]);
    expect(visibleLabel(view, labeled(view, "Translation (de)"))).toBe("Translation");
    expect(visibleLabel(view, labeled(view, "Never use (de)"))).toBe("Never use");
    for (const text of ["Note", "Part of speech"]) {
      expect(labeled(view, text).hasAttribute("aria-label")).toBe(false);
    }
  });

  it("moves focus into the translation field on edit and back to Edit on cancel or save", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    await clickAsync(buttonLabeled(view, "Edit checkout"));
    expect(document.activeElement).toBe(labeled(view, "Translation (all locales)"));

    await clickAsync(view.getByText("button", "Cancel"));
    expect(document.activeElement).toBe(buttonLabeled(view, "Edit checkout"));

    await clickAsync(buttonLabeled(view, "Edit checkout"));
    typeInto(labeled(view, "Translation (all locales)"), "Bezahlung");
    await clickAsync(view.getByText("button", "Save"));
    expect(document.activeElement).toBe(buttonLabeled(view, "Edit checkout"));
  });

  it("shows each locale's own translation with its code and counts the never-use rules", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    expect(view.text()).toContain("1 never-use rule; choose a locale to see them");
    expect(view.all(".bg-neutral-soft").some((badge) => badge.textContent === "de")).toBe(true);
    expect(view.text()).not.toContain("not target locales");
  });

  it("marks a stored locale that is not a target locale as read-only", async () => {
    const regional: GlossaryTermView = {
      ...DASHBOARD,
      targets: { "de-AT": "Armaturenbrett" },
      forbidden: {},
    };
    const view = await renderAsync(
      <GlossarySection glossary={{ ...FILE_BACKED, terms: [regional] }} onChange={() => {}} />,
    );

    expect(view.text()).toContain("Armaturenbrett");
    expect(view.text()).toContain("not target locales of this project");
  });

  it("lets a long unbroken value wrap instead of overflowing", async () => {
    const long = "x".repeat(300);
    const view = render(
      <GlossarySection
        glossary={{
          ...FILE_BACKED,
          terms: [
            {
              ...DASHBOARD,
              source: long,
              note: long,
              byLocale: { de: { target: long, inherited: false, forbidden: [long] } },
            },
          ],
        }}
        onChange={() => {}}
      />,
    );
    await showLocale(view, "de");

    const wrapping = view
      .all('[class*="[overflow-wrap:anywhere]"]')
      .map((node) => node.textContent);
    expect(wrapping.filter((text) => text === long).length).toBeGreaterThanOrEqual(4);
  });

  it("removes a shared-only term by clearing its translation", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await clickAsync(buttonLabeled(view, "Remove checkout"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "checkout", translation: null } },
    ]);
  });

  it("disables the row's own actions while its write is in flight", async () => {
    stubRpc({ "glossary.write": () => new Promise(() => {}) });

    const view = render(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    await clickAsync(buttonLabeled(view, "Remove checkout"));

    expect(buttonLabeled(view, "Remove checkout").hasAttribute("disabled")).toBe(true);
    expect(buttonLabeled(view, "Remove verbatra").hasAttribute("disabled")).toBe(false);
  });

  it("neither edits, removes, nor shows the real value of a term the server redacted", async () => {
    const redacted: GlossaryGetResult = {
      ...FILE_BACKED,
      terms: [sharedTerm("apiTerm", "[REDACTED]")],
      redactedTerms: ["apiTerm"],
    };

    const view = await renderAsync(<GlossarySection glossary={redacted} onChange={() => {}} />);

    expect(view.query('button[aria-label="Edit apiTerm"]')).toBeNull();
    expect(view.query('button[aria-label="Remove apiTerm"]')).toBeNull();
    expect(view.text()).toContain("looks like a secret");
  });
});

describe("GlossarySection, do-not-translate terms", () => {
  it("lists the kept terms and stops keeping one", async () => {
    stubRpc({ "glossary.write": writeAnswer({ ...FILE_BACKED, doNotTranslate: [] }) });

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    expect(view.text()).toContain("Northwind");
    expect(view.text()).toContain("Match case");
    await clickAsync(buttonLabeled(view, "Remove Northwind from do not translate"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "Northwind", doNotTranslate: false } },
    ]);
  });

  it("moves focus to the next kept term after a removal, and to the input after the last", async () => {
    const two: GlossaryGetResult = {
      ...FILE_BACKED,
      doNotTranslate: [
        { term: "Northwind", caseSensitive: true },
        { term: "Acme", caseSensitive: false },
      ],
    };
    const one: GlossaryGetResult = {
      ...FILE_BACKED,
      doNotTranslate: [{ term: "Acme", caseSensitive: false }],
    };
    const none: GlossaryGetResult = { ...FILE_BACKED, doNotTranslate: [] };
    let current = two;
    stubRpc({
      "glossary.write": () => {
        current = current === two ? one : none;
        return Promise.resolve(writeAnswer(current));
      },
    });
    const view = render(<Stateful initial={two} />);

    await clickAsync(buttonLabeled(view, "Remove Northwind from do not translate"));
    expect(document.activeElement).toBe(buttonLabeled(view, "Remove Acme from do not translate"));

    await clickAsync(buttonLabeled(view, "Remove Acme from do not translate"));
    expect(document.activeElement).toBe(field(view, "New do-not-translate term"));
  });

  it("shows Match case on a kept term only when it is on", async () => {
    const view = await renderAsync(
      <GlossarySection
        glossary={{
          ...FILE_BACKED,
          terms: [],
          doNotTranslate: [
            { term: "Northwind", caseSensitive: true },
            { term: "Acme", caseSensitive: false },
          ],
        }}
        onChange={() => {}}
      />,
    );
    const items = view.all("ul li").map((item) => item.textContent ?? "");

    expect(items.find((text) => text.includes("Northwind"))).toContain("Match case");
    expect(items.find((text) => text.includes("Acme"))).not.toContain("Match case");
  });

  it("keeps a new term untranslated, matching case unless told otherwise", async () => {
    stubRpc({ "glossary.write": writeAnswer(FILE_BACKED) });

    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);
    typeInto(field(view, "New do-not-translate term"), " Acme ");
    await clickAsync(view.getByText("button", "Keep untranslated"));
    typeInto(field(view, "New do-not-translate term"), "Contoso");
    await clickAsync(view.get('input[aria-label="Match case for the new do-not-translate term"]'));
    await clickAsync(view.getByText("button", "Keep untranslated"));

    expect(rpcCalls).toEqual([
      { method: "glossary.write", params: { term: "Acme", doNotTranslate: true } },
      {
        method: "glossary.write",
        params: { term: "Contoso", doNotTranslate: true, caseSensitive: false },
      },
    ]);
    expect(field(view, "New do-not-translate term").value).toBe("");
    expect(
      (
        view.get(
          'input[aria-label="Match case for the new do-not-translate term"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("invites the first kept term when there is none yet", async () => {
    const view = await renderAsync(
      <GlossarySection glossary={{ ...FILE_BACKED, doNotTranslate: [] }} onChange={() => {}} />,
    );

    expect(view.text()).toContain("No term is kept untranslated yet");
  });
});

describe("GlossarySection, not file-backed", () => {
  it("explains an inline glossary and offers no way to change it", async () => {
    const view = await renderAsync(
      <GlossarySection
        glossary={{ ...FILE_BACKED, indicator: { source: "inline" } }}
        onChange={() => {}}
      />,
    );

    expect(view.text()).toContain("written inline in the verbatra config");
    expect(view.all("button")).toHaveLength(0);
    expect(view.query("input")).toBeNull();
    expect(view.text()).toContain("Northwind");
  });

  it("explains a project with no glossary and offers no way to create one from here", async () => {
    const view = await renderAsync(
      <GlossarySection
        glossary={{
          indicator: { source: "none" },
          version: null,
          locales: ["de"],
          terms: [],
          doNotTranslate: [],
          redactedTerms: [],
        }}
        onChange={() => {}}
      />,
    );

    expect(view.text()).toContain("no glossary yet");
    expect(view.text()).toContain("No glossary terms");
    expect(view.all("button")).toHaveLength(0);
    expect(view.query("select")).toBeNull();
    expect(view.text()).not.toContain("Do not translate");
  });

  it("names the file a file-backed glossary came from, and says nothing about read-only", async () => {
    const view = await renderAsync(<GlossarySection glossary={FILE_BACKED} onChange={() => {}} />);

    expect(view.text()).toContain("Source: file (glossary.json)");
    expect(view.text()).not.toContain("written inline");
  });
});
