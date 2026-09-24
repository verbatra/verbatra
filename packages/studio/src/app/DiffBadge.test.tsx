// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DiffBadge, type DiffTone, KeyLocaleStatusBadge } from "./DiffBadge.js";
import { render } from "./test-support.js";

const TONE_EXPECTATIONS: Readonly<
  Record<DiffTone, { readonly label: string; readonly bg: string }>
> = {
  missing: { label: "Missing", bg: "bg-diff-new-soft" },
  changed: { label: "Changed", bg: "bg-diff-changed-soft" },
  orphaned: { label: "Orphaned", bg: "bg-diff-orphaned-soft" },
  protected: { label: "Protected", bg: "bg-warning-soft" },
};

const TONES = Object.keys(TONE_EXPECTATIONS) as readonly DiffTone[];

describe("DiffBadge", () => {
  it.each(TONES)("labels the %s tone with its own word, never with color alone", (tone) => {
    const view = render(<DiffBadge tone={tone} />);

    expect(view.text()).toBe(TONE_EXPECTATIONS[tone].label);
  });

  it.each(TONES)("styles the %s tone from its own token pair", (tone) => {
    const view = render(<DiffBadge tone={tone} />);

    expect(view.get("span").className).toContain(TONE_EXPECTATIONS[tone].bg);
  });

  it("gives each tone a distinct label, so two pills are never confusable", () => {
    const labels = TONES.map((tone) => render(<DiffBadge tone={tone} />).text());

    expect(new Set(labels).size).toBe(TONES.length);
  });

  it("hides the leading dot from assistive technology", () => {
    const view = render(<DiffBadge tone="changed" />);
    const dot = view.all("span")[1];

    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries the shared pill shell, so it aligns with the status badges beside it", () => {
    const view = render(<DiffBadge tone="missing" />);

    expect(view.get("span").className).toContain("rounded-sm");
  });
});

describe("KeyLocaleStatusBadge", () => {
  it.each([
    ["in-sync", "In sync"],
    ["absent", "Absent"],
    ["missing", "Missing"],
  ] as const)("labels %s as %s", (status, label) => {
    expect(render(<KeyLocaleStatusBadge status={status} />).text()).toBe(label);
  });
});
