// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.js";
import { ValueReplaceButton } from "./ValueReplaceButton.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

describe("ValueReplaceButton", () => {
  it("opens the dialog when no editor draft is unsaved", () => {
    const view = render(<ValueReplaceButton locales={["de"]} draftKey={null} />);

    click(view.get("[data-value-replace-open]"));

    expect(view.query('[role="dialog"]')).not.toBeNull();
    expect(view.query("[data-value-replace-hold]")).toBeNull();
  });

  it("holds while an editor draft is unsaved, names the key, and opens nothing", () => {
    const view = render(<ValueReplaceButton locales={["de"]} draftKey="greeting.hello" />);

    const button = view.get("[data-value-replace-open]");
    click(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe("value-replace-hold");
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("[data-value-replace-hold]").textContent).toContain("greeting.hello");
  });

  it("closes the dialog from its close button", () => {
    const view = render(<ValueReplaceButton locales={["de"]} draftKey={null} />);
    click(view.get("[data-value-replace-open]"));

    click(view.get('[aria-label="Close search and replace"]'));

    expect(view.query('[role="dialog"]')).toBeNull();
  });
});
