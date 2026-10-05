// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox.js";
import { click, render } from "./test-support.js";

function input(view: ReturnType<typeof render>): HTMLInputElement {
  return view.get("input") as HTMLInputElement;
}

describe("Checkbox", () => {
  it("is a native checkbox reporting its checked state", () => {
    const view = render(<Checkbox checked aria-label="Pick" onChange={vi.fn()} />);

    expect(input(view).type).toBe("checkbox");
    expect(input(view).checked).toBe(true);
    expect(input(view).hasAttribute("aria-checked")).toBe(false);
  });

  it("shows a mixed state through the native indeterminate property", () => {
    const view = render(
      <Checkbox checked={false} indeterminate aria-label="All" onChange={vi.fn()} />,
    );

    expect(input(view).indeterminate).toBe(true);
    expect(input(view).hasAttribute("aria-checked")).toBe(false);
    view.rerender(<Checkbox checked={false} aria-label="All" onChange={vi.fn()} />);
    expect(input(view).indeterminate).toBe(false);
  });

  it("calls onChange when toggled", () => {
    const onChange = vi.fn();
    const view = render(<Checkbox checked={false} aria-label="Pick" onChange={onChange} />);

    click(input(view));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
