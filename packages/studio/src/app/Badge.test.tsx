// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Badge, type BadgeTone } from "./Badge.js";
import { render } from "./test-support.js";

const TONE_CLASSES: Readonly<Record<BadgeTone, readonly [string, string]>> = {
  success: ["bg-success-soft", "text-success"],
  warning: ["bg-warning-soft", "text-warning"],
  neutral: ["bg-neutral-soft", "text-neutral"],
  danger: ["bg-danger-soft", "text-danger"],
};

const TONES = Object.keys(TONE_CLASSES) as readonly BadgeTone[];

describe("Badge", () => {
  it.each(TONES)("styles the %s tone from its own background and text tokens", (tone) => {
    const view = render(<Badge tone={tone}>Up to date</Badge>);
    const className = view.get("span").className;
    const expected = TONE_CLASSES[tone];

    expect(className).toContain(expected[0]);
    expect(className).toContain(expected[1]);
  });

  it.each(TONES)("keeps the caller's label visible on the %s tone", (tone) => {
    const view = render(<Badge tone={tone}>42 pending</Badge>);

    expect(view.text()).toBe("42 pending");
  });

  it("renders exactly the text it was given and never derives a label from the tone", () => {
    const view = render(<Badge tone="danger">All good</Badge>);

    expect(view.text()).toBe("All good");
  });

  it("hides the leading dot from assistive technology, so only the label is announced", () => {
    const view = render(<Badge tone="neutral">Idle</Badge>);
    const dot = view.all("span")[1];

    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries the shared pill shell, so every status pill lines up with the others", () => {
    const view = render(<Badge tone="success">Done</Badge>);

    expect(view.get("span").className).toContain("rounded-sm");
  });

  it("accepts rich children, not just a string", () => {
    const view = render(
      <Badge tone="warning">
        <strong>7</strong> stale
      </Badge>,
    );

    expect(view.get("strong").textContent).toBe("7");
  });

  it("stays on one line by default and wraps a long value only when asked", () => {
    expect(render(<Badge tone="danger">x</Badge>).get("span").className).toContain(
      "whitespace-nowrap",
    );
    const wrapped = render(
      <Badge tone="danger" wrap>
        x
      </Badge>,
    ).get("span").className;
    expect(wrapped).toContain("whitespace-normal");
    expect(wrapped).toContain("[overflow-wrap:anywhere]");
    expect(wrapped).not.toContain("whitespace-nowrap");
  });
});
