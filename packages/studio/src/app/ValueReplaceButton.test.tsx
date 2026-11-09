// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.js";
import { ValueReplaceButton } from "./ValueReplaceButton.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function dialogOpen(view: ReturnType<typeof render>): boolean {
  return view.query('[role="dialog"]') !== null;
}

describe("ValueReplaceButton", () => {
  it("opens the dialog at once when no editor draft is unsaved", () => {
    const holdForDraft = vi.fn(() => false);
    const view = render(
      <ValueReplaceButton locales={["de"]} draftKey={null} holdForDraft={holdForDraft} />,
    );

    click(view.get("[data-value-replace-open]"));

    expect(dialogOpen(view)).toBe(true);
    expect(holdForDraft).not.toHaveBeenCalled();
  });

  it("hands an unsaved draft to the editor's own hold and opens only when that hold proceeds", () => {
    let proceed: () => void = () => {};
    const holdForDraft = vi.fn((onProceed: () => void) => {
      proceed = onProceed;
      return true;
    });
    const view = render(
      <ValueReplaceButton locales={["de"]} draftKey="greeting" holdForDraft={holdForDraft} />,
    );

    click(view.get("[data-value-replace-open]"));
    expect(holdForDraft).toHaveBeenCalledTimes(1);
    expect(dialogOpen(view)).toBe(false);

    proceed();
    view.rerender(
      <ValueReplaceButton locales={["de"]} draftKey="greeting" holdForDraft={holdForDraft} />,
    );
    expect(dialogOpen(view)).toBe(true);
  });

  it("opens nothing when the hold is never proceeded, as after Keep editing", () => {
    const holdForDraft = vi.fn(() => true);
    const view = render(
      <ValueReplaceButton locales={["de"]} draftKey="greeting" holdForDraft={holdForDraft} />,
    );

    click(view.get("[data-value-replace-open]"));
    view.rerender(
      <ValueReplaceButton locales={["de"]} draftKey="greeting" holdForDraft={holdForDraft} />,
    );

    expect(dialogOpen(view)).toBe(false);
  });

  it("opens at once when the editor reports a draft but nothing blocks", () => {
    const holdForDraft = vi.fn(() => false);
    const view = render(
      <ValueReplaceButton locales={["de"]} draftKey="greeting" holdForDraft={holdForDraft} />,
    );

    click(view.get("[data-value-replace-open]"));

    expect(dialogOpen(view)).toBe(true);
  });

  it("closes the dialog from its close button", () => {
    const view = render(
      <ValueReplaceButton locales={["de"]} draftKey={null} holdForDraft={vi.fn(() => false)} />,
    );
    click(view.get("[data-value-replace-open]"));

    click(view.get('[aria-label="Close search and replace"]'));

    expect(dialogOpen(view)).toBe(false);
  });
});
