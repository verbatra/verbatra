// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderSearch } from "./HeaderSearch.js";
import { render, typeInto } from "./test-support.js";

function submit(form: HTMLElement): void {
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "#/review");
});

describe("HeaderSearch", () => {
  it("is a named search landmark with a named field", () => {
    const view = render(<HeaderSearch />);

    expect(view.get("search").getAttribute("aria-label")).toBe("Keys");
    expect(view.get("input").getAttribute("aria-label")).toBe("Search keys and translations");
  });

  it("opens the translations list filtered by the typed text", () => {
    const view = render(<HeaderSearch />);

    typeInto(view.get("input") as HTMLInputElement, "nav title");
    submit(view.get("form"));

    expect(window.location.hash).toBe("#/translations?q=nav+title");
  });

  it("clears the field after searching and tells the caller", () => {
    const onSearch = vi.fn();
    const view = render(<HeaderSearch onSearch={onSearch} />);

    typeInto(view.get("input") as HTMLInputElement, "x");
    submit(view.get("form"));

    expect((view.get("input") as HTMLInputElement).value).toBe("");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("opens the plain list when nothing was typed", () => {
    const view = render(<HeaderSearch />);

    submit(view.get("form"));

    expect(window.location.hash).toBe("#/translations");
  });
});
