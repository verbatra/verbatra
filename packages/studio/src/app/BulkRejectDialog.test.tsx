// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BulkRejectDialog } from "./BulkRejectDialog.js";
import { click, flush, pressKey, render } from "./test-support.js";

const ENTRIES = [
  { locale: "de", key: "checkout.title", value: "Kasse" },
  { locale: "ar", key: "cart.badge", value: "سلة {count}" },
];

describe("BulkRejectDialog", () => {
  it("names how many entries it rejects and lists each with its value", () => {
    const view = render(
      <BulkRejectDialog entries={ENTRIES} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Reject 2 entries");
    const items = view.all("[data-bulk-reject-entry]");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "checkout.title (de)",
      "cart.badge (ar)",
    ]);
    expect(items[1]?.querySelector('[dir="rtl"]')?.textContent).toBe("سلة {count}");
    expect(view.getByText("button", "Reject and remove 2 entries")).toBeDefined();
  });

  it("uses the singular for one entry", () => {
    const view = render(
      <BulkRejectDialog entries={ENTRIES.slice(0, 1)} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );

    expect(view.getByText("button", "Reject and remove 1 entry")).toBeDefined();
  });

  it("confirms only from the danger button, and cancels from Cancel and Escape", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <BulkRejectDialog entries={ENTRIES} onConfirm={onConfirm} onClose={onClose} />,
    );

    click(view.getByText("button", "Cancel"));
    pressKey("Escape");
    await flush();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);

    click(view.getByText("button", "Reject and remove 2 entries"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
