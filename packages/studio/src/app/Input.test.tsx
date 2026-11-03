// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { SearchInput, TextArea } from "./Input.js";
import { render, typeInto } from "./test-support.js";

describe("TextArea", () => {
  it("renders a real textarea, so long values wrap instead of scrolling on one line", () => {
    const view = render(<TextArea aria-label="Translation" />);

    expect(view.get("textarea").tagName).toBe("TEXTAREA");
  });

  it("carries the shared bordered-field look", () => {
    const view = render(<TextArea aria-label="Translation" />);
    const className = view.get("textarea").className;

    expect(className).toContain("border-border");
    expect(className).toContain("bg-input");
  });

  it("merges a caller className onto the field classes", () => {
    const view = render(<TextArea aria-label="Translation" className="h-32" />);

    expect(view.get("textarea").className).toContain("h-32");
  });

  it("forwards the native attributes a caller labels and sizes the field with", () => {
    const view = render(<TextArea aria-label="Translation" rows={6} placeholder="Enter a value" />);
    const field = view.get("textarea");

    expect(field.getAttribute("aria-label")).toBe("Translation");
    expect(field.getAttribute("rows")).toBe("6");
    expect(field.getAttribute("placeholder")).toBe("Enter a value");
  });

  it("reports an edit to the caller's change handler", () => {
    const onChange = vi.fn();
    const view = render(<TextArea aria-label="Translation" onChange={onChange} />);

    typeInto(view.get("textarea") as HTMLTextAreaElement, "Guten Tag");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((view.get("textarea") as HTMLTextAreaElement).value).toBe("Guten Tag");
  });
});

describe("SearchInput", () => {
  it("renders a search-type input, so the browser offers the clear affordance", () => {
    const view = render(<SearchInput aria-label="Filter keys" />);

    expect(view.get("input").getAttribute("type")).toBe("search");
  });

  it("shows a leading glyph that is decorative only", () => {
    const view = render(<SearchInput aria-label="Filter keys" />);
    const glyph = view.get("svg");

    expect(glyph.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.getAttribute("width")).toBe("14");
  });

  it("keeps the glyph out of the pointer's way, so clicking it focuses the field", () => {
    const view = render(<SearchInput aria-label="Filter keys" />);

    expect(view.get("svg").getAttribute("class")).toContain("pointer-events-none");
  });

  it("insets the text so it clears the glyph", () => {
    const view = render(<SearchInput aria-label="Filter keys" />);

    expect(view.get("input").className).toContain("ps-8");
  });

  it("merges a caller className onto the field classes", () => {
    const view = render(<SearchInput aria-label="Filter keys" className="max-w-full" />);

    expect(view.get("input").className).toContain("max-w-full");
  });

  it("forwards the native attributes the caller labels the field with", () => {
    const view = render(<SearchInput aria-label="Filter keys" placeholder="Search keys" />);
    const field = view.get("input");

    expect(field.getAttribute("aria-label")).toBe("Filter keys");
    expect(field.getAttribute("placeholder")).toBe("Search keys");
  });

  it("reports each keystroke to the caller, which is what filter-as-you-type depends on", () => {
    const seen: string[] = [];
    const view = render(
      <SearchInput
        aria-label="Filter keys"
        onChange={(event) => {
          seen.push(event.currentTarget.value);
        }}
      />,
    );
    const field = view.get("input") as HTMLInputElement;

    typeInto(field, "app.");
    typeInto(field, "app.title");

    expect(seen).toEqual(["app.", "app.title"]);
  });
});
