// @vitest-environment jsdom
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../shared/rpc/glossary.js";
import { GlossarySection } from "./GlossarySection.js";
import type { RenderResult } from "./test-support.js";
import {
  buttonNamed,
  clickAsync,
  FILE_BACKED_GLOSSARY,
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

function description(view: RenderResult, input: HTMLElement): string {
  const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids
    .map((id) => view.container.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ");
}

describe("inline validation notes are tied to their field", () => {
  it("links the add form's term-length note and flags the field invalid", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = textboxNamed(view, "New glossary term");
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();

    typeInto(field, "a".repeat(201));

    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, field)).toContain("A term can be at most 200 characters");
  });

  it("links the add form's exists note and its translation limit note", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const term = textboxNamed(view, "New glossary term");
    typeInto(term, "checkout");
    expect(term.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, term)).toContain("checkout is already in the glossary");

    const translation = textboxNamed(view, "New glossary translation");
    typeInto(translation, "x".repeat(2_000));
    expect(translation.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, translation)).toContain("at its limit of 2000 characters");
  });

  it("links the keep form's length and exists notes", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    const field = textboxNamed(view, "New do-not-translate term");

    typeInto(field, "b".repeat(201));
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, field)).toContain("A term can be at most 200 characters");

    typeInto(field, "Northwind");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, field)).toContain("Northwind is already kept untranslated");

    typeInto(field, "Fresh");
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();
  });

  it("links the editor's limit notes and the never-use hint and problem", async () => {
    const view = await renderAsync(<Stateful initial={FILE_BACKED_GLOSSARY} />);
    selectOption(view.get("select") as HTMLSelectElement, "de");
    await clickAsync(buttonNamed(view, "Edit Dashboard"));

    const never = textboxNamed(view, "Never use (de)");
    expect(never.getAttribute("aria-invalid")).toBeNull();
    expect(description(view, never)).toContain("One per line");

    typeInto(never, Array.from({ length: 51 }, (_, index) => `r${index}`).join("\n"));
    expect(never.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, never)).toContain("One per line");
    expect(description(view, never)).toContain("At most 50 never-use renderings");

    const note = textboxNamed(view, "Note");
    typeInto(note, "n".repeat(500));
    expect(note.getAttribute("aria-invalid")).toBe("true");
    expect(description(view, note)).toContain("A note is at its limit of 500 characters");

    const translation = textboxNamed(view, "Translation (de)");
    typeInto(translation, "t".repeat(2_000));
    expect(description(view, translation)).toContain("A translation is at its limit");

    const speech = textboxNamed(view, "Part of speech");
    typeInto(speech, "p".repeat(50));
    expect(description(view, speech)).toContain("A part of speech is at its limit");
  });
});
