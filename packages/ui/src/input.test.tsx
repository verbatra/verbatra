// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { FieldSize } from "./field.ts";
import { SearchInput, TextArea, TextField } from "./input.tsx";
import { render, typeInto } from "./test-support.tsx";

const SIZES: readonly FieldSize[] = ["xs", "sm", "md"];

describe("TextField", () => {
  it("is a text input by default and honors an explicit type", () => {
    const plain = render(<TextField aria-label="Name" />);
    expect(plain.get("input").getAttribute("type")).toBe("text");

    const email = render(<TextField aria-label="Mail" type="email" />);
    expect(email.get("input").getAttribute("type")).toBe("email");
  });

  it("defaults to the small size, the one the default Button shares", () => {
    const view = render(<TextField aria-label="Name" />);

    expect(view.get("input").dataset.size).toBe("sm");
  });

  it.each(SIZES)("reports the %s size", (size) => {
    const view = render(<TextField aria-label="Name" size={size} />);

    expect(view.get("input").dataset.size).toBe(size);
  });

  it("carries the shared focus hook and merges a caller className", () => {
    const view = render(<TextField aria-label="Name" className="mt-1" />);
    const names = view.get("input").className.split(" ");

    expect(names).toContain("vk-field");
    expect(names).toContain("mt-1");
  });

  it("forwards native attributes and reports each edit", () => {
    const onChange = vi.fn();
    const view = render(
      <TextField aria-label="Name" placeholder="Brand" disabled={false} onChange={onChange} />,
    );
    const input = view.get<HTMLInputElement>("input");

    typeInto(input, "Acme");

    expect(input.placeholder).toBe("Brand");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("marks an invalid field through aria-invalid, which also drives its border", () => {
    const view = render(<TextField aria-label="Name" aria-invalid />);

    expect(view.get("input").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("TextArea", () => {
  it("is a real textarea, so long values wrap", () => {
    const view = render(<TextArea aria-label="Translation" defaultValue="a\nb" />);

    expect(view.get("textarea").tagName).toBe("TEXTAREA");
    expect(view.get("textarea").className.split(" ")).toContain("vk-field");
  });

  it("forwards native attributes and reports each edit", () => {
    const onChange = vi.fn();
    const view = render(<TextArea aria-label="Translation" lang="de" onChange={onChange} />);
    const area = view.get<HTMLTextAreaElement>("textarea");

    typeInto(area, "Hallo");

    expect(area.lang).toBe("de");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("SearchInput", () => {
  it("is a search input, so the browser offers its clear affordance", () => {
    const view = render(<SearchInput aria-label="Filter" />);

    expect(view.get("input").getAttribute("type")).toBe("search");
    expect(view.get("input").dataset.size).toBe("sm");
  });

  it("draws a decorative glyph that never takes the pointer", () => {
    const view = render(<SearchInput aria-label="Filter" />);
    const glyph = view.get("svg");

    expect(glyph.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.getAttribute("class")).toContain("pointer-events-none");
  });

  it.each(SIZES)("insets the text past the glyph at the %s size", (size) => {
    const view = render(<SearchInput aria-label="Filter" size={size} />);

    expect(view.get("input").className).toMatch(/\bps-(7|8|10)\b/);
    expect(view.get("input").dataset.size).toBe(size);
  });

  it("reports each keystroke, which filter-as-you-type depends on", () => {
    const onChange = vi.fn();
    const view = render(<SearchInput aria-label="Filter" onChange={onChange} />);

    typeInto(view.get<HTMLInputElement>("input"), "greeting");

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
