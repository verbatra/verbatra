// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DiffBadge, type DiffTone, isDiffTone, KeyLocaleStatusBadge } from "./DiffBadge.js";
import { render } from "./test-support.js";

const TONE_EXPECTATIONS: Readonly<Record<DiffTone, { readonly label: string }>> = {
  missing: { label: "Missing" },
  changed: { label: "Changed" },
  orphaned: { label: "Orphaned" },
  protected: { label: "Protected" },
};

const TONES = Object.keys(TONE_EXPECTATIONS) as readonly DiffTone[];

describe("DiffBadge", () => {
  it.each(TONES)("labels the %s tone with its own word, never with color alone", (tone) => {
    const view = render(<DiffBadge tone={tone} />);

    expect(view.text()).toBe(TONE_EXPECTATIONS[tone].label);
  });

  it.each(TONES)("renders the %s tone as the matching badge tone", (tone) => {
    const view = render(<DiffBadge tone={tone} />);

    expect(view.get("span").dataset.tone).toBe(tone);
  });

  it("gives each tone a distinct label, so two pills are never confusable", () => {
    const labels = TONES.map((tone) => render(<DiffBadge tone={tone} />).text());

    expect(new Set(labels).size).toBe(TONES.length);
  });

  it("renders one span, so a status never adds an extra node to the announcement", () => {
    const view = render(<DiffBadge tone="changed" />);

    expect(view.all("span")).toHaveLength(1);
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

describe("isDiffTone", () => {
  it.each(TONES)("accepts the diff tone %s", (tone) => {
    expect(isDiffTone(tone)).toBe(true);
  });

  it.each(["integrity", "review", "toString", ""])(
    "rejects %j, which has no diff badge",
    (value) => {
      expect(isDiffTone(value)).toBe(false);
    },
  );
});
