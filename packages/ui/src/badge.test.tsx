// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Badge, type BadgeTone } from "./badge.tsx";
import { render } from "./test-support.tsx";

const TONES: readonly BadgeTone[] = [
  "neutral",
  "glow",
  "new",
  "changed",
  "unchanged",
  "solid",
  "success",
  "warning",
  "danger",
  "missing",
  "orphaned",
  "protected",
];

describe("Badge", () => {
  it("defaults to the neutral tone", () => {
    const view = render(<Badge>Idle</Badge>);

    expect(view.get("span").dataset.tone).toBe("neutral");
  });

  it.each(TONES)("reports the %s tone and keeps the label", (tone) => {
    const view = render(<Badge tone={tone}>42 pending</Badge>);

    expect(view.get("span").dataset.tone).toBe(tone);
    expect(view.text()).toBe("42 pending");
  });

  it.each(["success", "warning", "danger"] as const)(
    "tints the %s tone with its own status token",
    (tone) => {
      const className = render(<Badge tone={tone}>x</Badge>).get("span").className;

      expect(className).toContain(`text-(--status-${tone})`);
      expect(className).toContain(`bg-(--status-${tone}-soft)`);
    },
  );

  it.each(["changed", "missing", "orphaned", "protected"] as const)(
    "tints the %s tone with its diff token, its soft fill and a 40 percent border",
    (tone) => {
      const className = render(<Badge tone={tone}>x</Badge>).get("span").className;

      expect(className).toContain(`text-(--diff-${tone})`);
      expect(className).toContain(`bg-(--diff-${tone}-soft)`);
      expect(className).toContain(`var(--diff-${tone})_40%`);
    },
  );

  it("pins the normal font weight so a badge never inherits a heavier one", () => {
    expect(
      render(<Badge>x</Badge>)
        .get("span")
        .className.split(" "),
    ).toContain("font-normal");
  });

  it("fills the solid tone and leaves the other site tones unfilled", () => {
    expect(render(<Badge tone="solid">x</Badge>).get("span").className).toContain(
      "bg-(--accent-fill)",
    );
    expect(render(<Badge tone="glow">x</Badge>).get("span").className).not.toContain("bg-");
  });

  it("accepts rich children, not just a string", () => {
    const view = render(
      <Badge tone="warning">
        <strong>7</strong> stale
      </Badge>,
    );

    expect(view.get("strong").textContent).toBe("7");
  });

  it("stays on one line and uppercase by default", () => {
    const names = render(<Badge tone="danger">x</Badge>)
      .get("span")
      .className.split(" ");

    expect(names).toContain("whitespace-nowrap");
    expect(names).toContain("uppercase");
  });

  it("wraps a long value only when asked, without touching its case", () => {
    const names = render(
      <Badge tone="danger" wrap>
        x
      </Badge>,
    )
      .get("span")
      .className.split(" ");

    expect(names).toContain("whitespace-normal");
    expect(names).toContain("[overflow-wrap:anywhere]");
    expect(names).not.toContain("whitespace-nowrap");
    expect(names).toContain("uppercase");
  });

  it("shows a verbatim value in its own case and spacing, separately from wrapping", () => {
    const names = render(<Badge verbatim>de-AT</Badge>)
      .get("span")
      .className.split(" ");

    expect(names).toContain("normal-case");
    expect(names).toContain("tracking-normal");
    expect(names).not.toContain("uppercase");
    expect(names).toContain("whitespace-nowrap");
  });
});
