// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { FieldSize } from "./field.ts";
import { Select } from "./select.tsx";
import { render, selectOption } from "./test-support.tsx";

const SIZES: readonly FieldSize[] = ["xs", "sm", "md"];

function options() {
  return (
    <>
      <option value="">All locales</option>
      <option value="de">de</option>
    </>
  );
}

describe("Select", () => {
  it("is a native select holding the options it was handed", () => {
    const view = render(<Select aria-label="Locale">{options()}</Select>);

    expect(view.get("select").tagName).toBe("SELECT");
    expect(view.all("option").map((option) => option.textContent)).toEqual(["All locales", "de"]);
  });

  it("defaults to the small size and reports the one it is given", () => {
    expect(
      render(<Select aria-label="Locale">{options()}</Select>).get("select").dataset.size,
    ).toBe("sm");
    for (const size of SIZES) {
      const view = render(
        <Select aria-label="Locale" size={size}>
          {options()}
        </Select>,
      );
      expect(view.get("select").dataset.size).toBe(size);
    }
  });

  it("carries the shared focus hook and merges a caller className", () => {
    const view = render(
      <Select aria-label="Locale" className="min-w-40">
        {options()}
      </Select>,
    );
    const names = view.get("select").className.split(" ");

    expect(names).toContain("vk-field");
    expect(names).toContain("min-w-40");
  });

  it("hides its chevron from assistive technology and from the pointer", () => {
    const view = render(<Select aria-label="Locale">{options()}</Select>);
    const overlay = view.get("[aria-hidden='true']");

    expect(overlay.className).toContain("pointer-events-none");
    expect(overlay.querySelector("svg")).not.toBeNull();
  });

  it("forwards native attributes and reports the chosen value", () => {
    const onChange = vi.fn();
    const view = render(
      <Select aria-label="Locale" disabled onChange={onChange}>
        {options()}
      </Select>,
    );
    const select = view.get<HTMLSelectElement>("select");

    selectOption(select, "de");

    expect(select.disabled).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
