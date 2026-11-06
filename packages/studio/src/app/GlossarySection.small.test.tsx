// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult, GlossaryTermView } from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import { useGlossaryBench } from "./glossary-bench.js";
import {
  buttonNamed,
  clickAsync,
  elementNamed,
  FILE_BACKED_GLOSSARY,
  flush,
  glossaryWrites,
  render,
  renderAsync,
  selectOption,
  textboxNamed,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function Stateful({ initial }: { readonly initial: GlossaryGetResult }): ReactNode {
  const [glossary, setGlossary] = useState(initial);
  return <GlossarySection glossary={glossary} onChange={setGlossary} />;
}

describe("small glossary guards", () => {
  it("ignores a submit of an empty add form or keep form", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);

    act(() => {
      for (const form of view.all("form")) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });
    await flush();

    expect(glossaryWrites()).toEqual([]);
  });

  it("lists the never-use rules a clearing Save would drop", async () => {
    const ruled: GlossaryTermView = {
      source: "Shop",
      targets: { de: "Laden" },
      forbidden: { de: ["a", "b"] },
      caseSensitive: false,
      byLocale: { de: { target: "Laden", inherited: false, forbidden: ["a", "b"] } },
    };
    const view = await renderAsync(
      <Stateful initial={{ ...FILE_BACKED_GLOSSARY, terms: [ruled] }} />,
    );
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Shop"));
    typeInto(textboxNamed(view, "Translation (de)"), "");
    typeInto(textboxNamed(view, "Never use (de)"), "");
    await clickAsync(buttonNamed(view, "Save"));

    expect(view.query('[role="dialog"]')?.textContent).toContain("2 never-use rules");
  });

  it("focuses an editor that is already open when its Edit link is used again", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    typeInto(textboxNamed(view, "New glossary term"), "checkout");
    typeInto(textboxNamed(view, "New glossary translation"), "x");
    await clickAsync(elementNamed(view, "[data-exists-note] button", "Edit checkout"));
    textboxNamed(view, "Search terms").focus();

    await clickAsync(elementNamed(view, "[data-exists-note] button", "Edit checkout"));

    expect(document.activeElement).toBe(textboxNamed(view, "Translation (all locales)"));
  });

  it("refuses to use the bench outside a glossary section", () => {
    function Stray(): ReactNode {
      useGlossaryBench();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Stray />)).toThrow("GlossarySection above it");
    spy.mockRestore();
  });
});
