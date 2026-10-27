// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ReviewShortcutsDialog } from "./ReviewShortcutsDialog.js";
import { click, flush, pressKey, render } from "./test-support.js";

describe("ReviewShortcutsDialog", () => {
  it("is a labelled modal dialog listing every shortcut with its keys", () => {
    const view = render(<ReviewShortcutsDialog spend={true} onClose={vi.fn()} />);

    const dialog = view.get('[role="dialog"]');
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Keyboard shortcuts for the review queue");
    expect(view.all("[data-shortcut]").map((row) => row.dataset.shortcut)).toEqual([
      "next",
      "previous",
      "approve",
      "reject",
      "edit",
      "retranslate",
      "select",
      "help",
    ]);
  });

  it("draws arrow keys as glyphs with a spoken name, joined by or", () => {
    const view = render(<ReviewShortcutsDialog spend={false} onClose={vi.fn()} />);
    const next = view.get('[data-shortcut="next"]');

    expect(next.querySelectorAll("kbd")).toHaveLength(2);
    expect(next.querySelector('kbd [aria-hidden="true"]')?.textContent).toBe("j");
    expect(next.querySelectorAll("kbd")[1]?.textContent).toBe("↓Down arrow");
    expect(next.textContent).toContain("or");
    expect(next.textContent).toContain("Next entry");
  });

  it("says that the retranslate shortcut calls the provider", () => {
    const view = render(<ReviewShortcutsDialog spend={true} onClose={vi.fn()} />);

    expect(view.get('[data-shortcut="retranslate"]').textContent).toContain("calls your provider");
  });

  it("leaves retranslate out when spend is not allowed", () => {
    const view = render(<ReviewShortcutsDialog spend={false} onClose={vi.fn()} />);

    expect(view.query('[data-shortcut="retranslate"]')).toBeNull();
  });

  it("closes on Escape and from its close button", async () => {
    const onClose = vi.fn();
    const view = render(<ReviewShortcutsDialog spend={false} onClose={onClose} />);

    pressKey("Escape");
    await flush();
    click(view.get('button[aria-label="Close"]'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus into the dialog when it opens", () => {
    const view = render(<ReviewShortcutsDialog spend={false} onClose={vi.fn()} />);

    expect(view.get('[role="dialog"]').contains(document.activeElement)).toBe(true);
  });
});
