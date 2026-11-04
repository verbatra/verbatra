// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox.tsx";
import { click, render } from "./test-support.tsx";

describe("Checkbox", () => {
  it("is a native checkbox reporting its checked state", () => {
    const view = render(<Checkbox aria-label="Select" checked onChange={() => {}} />);
    const box = view.get<HTMLInputElement>("input");

    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(true);
    expect(box.className.split(" ")).toContain("vk-field");
  });

  it("shows a mixed state through the native indeterminate property", () => {
    const view = render(
      <Checkbox aria-label="Select all" checked={false} indeterminate onChange={() => {}} />,
    );

    expect(view.get<HTMLInputElement>("input").indeterminate).toBe(true);
  });

  it("is not indeterminate by default", () => {
    const view = render(<Checkbox aria-label="Select" checked={false} onChange={() => {}} />);

    expect(view.get<HTMLInputElement>("input").indeterminate).toBe(false);
  });

  it("calls onChange when toggled", () => {
    const onChange = vi.fn();
    const view = render(<Checkbox aria-label="Select" checked={false} onChange={onChange} />);

    click(view.get("input"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
