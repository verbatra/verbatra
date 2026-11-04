// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  DiffBadge,
  type DiffTone,
  isDiffTone,
  KeyLocaleStatusBadge,
  keyLocaleStatusLabel,
} from "./DiffBadge.js";
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
  it("renders in sync as quiet text with a dot, with no border or fill", () => {
    const view = render(<KeyLocaleStatusBadge status="in-sync" />);
    const quiet = view.get('[data-status="in-sync"]');

    expect(quiet.textContent).toBe("In sync");
    expect(view.query("[data-tone]")).toBeNull();
    expect(quiet.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("keeps every other state as a full badge", () => {
    expect(render(<KeyLocaleStatusBadge status="missing" />).get("[data-tone]").dataset.tone).toBe(
      "missing",
    );
    expect(render(<KeyLocaleStatusBadge status="absent" />).get("[data-tone]").dataset.tone).toBe(
      "neutral",
    );
  });

  it.each([
    ["in-sync", "In sync"],
    ["absent", "Absent"],
    ["missing", "Missing"],
  ] as const)("labels %s as %s", (status, label) => {
    expect(render(<KeyLocaleStatusBadge status={status} />).text()).toBe(label);
  });
});

describe("keyLocaleStatusLabel", () => {
  it.each([
    ["in-sync", "In sync"],
    ["absent", "Absent"],
    ["missing", "Missing"],
    ["changed", "Changed"],
    ["orphaned", "Orphaned"],
    ["protected", "Protected"],
  ] as const)("words %s as %s, the same as its badge", (status, label) => {
    expect(keyLocaleStatusLabel(status)).toBe(label);
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
