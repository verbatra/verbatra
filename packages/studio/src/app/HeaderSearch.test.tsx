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

function search(view: ReturnType<typeof render>, text: string): void {
  typeInto(view.get("input") as HTMLInputElement, text);
  submit(view.get("form"));
}

beforeEach(() => {
  window.history.replaceState(null, "", "#/review");
});

describe("HeaderSearch", () => {
  it("is a search landmark with the given name and a named field", () => {
    const view = render(<HeaderSearch label="Keys" />);

    expect(view.get("search").getAttribute("aria-label")).toBe("Keys");
    expect(view.get("input").getAttribute("aria-label")).toBe("Search keys and text");
  });

  it("opens the translations list filtered by the typed text from another page", () => {
    const view = render(<HeaderSearch label="Keys" />);

    search(view, "nav title");

    expect(window.location.hash).toBe("#/translations?q=nav+title");
  });

  it("merges the text into the translations filters it is already on", () => {
    window.history.replaceState(
      null,
      "",
      "#/translations?locale=de&status=missing&key=app.title&q=old",
    );
    const view = render(<HeaderSearch label="Keys" />);

    search(view, "new");

    expect(window.location.hash).toBe(
      "#/translations?locale=de&status=missing&key=app.title&q=new",
    );
  });

  it("does not carry review filters into the translations list", () => {
    window.history.replaceState(null, "", "#/review?locale=de");
    const view = render(<HeaderSearch label="Keys" />);

    search(view, "x");

    expect(window.location.hash).toBe("#/translations?q=x");
  });

  it("trims the text and treats whitespace only as no search", () => {
    const view = render(<HeaderSearch label="Keys" />);

    search(view, "  padded  ");
    expect(window.location.hash).toBe("#/translations?q=padded");

    search(view, "   ");
    expect(window.location.hash).toBe("#/translations");
  });

  it("clears the field after searching and tells the caller", () => {
    const onSearch = vi.fn();
    const view = render(<HeaderSearch label="Keys" onSearch={onSearch} />);

    search(view, "x");

    expect((view.get("input") as HTMLInputElement).value).toBe("");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
