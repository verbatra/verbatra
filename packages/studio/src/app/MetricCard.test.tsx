// @vitest-environment jsdom
import { microLabelClassName } from "@verbatra/ui";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard.js";
import { render } from "./test-support.js";

describe("MetricCard", () => {
  it("renders the label as the micro-label eyebrow and the figure under it", () => {
    const view = render(<MetricCard label="Missing keys" value="42" />);

    expect(view.getByText("span", "Missing keys").className).toBe(microLabelClassName);
    expect(view.getByText("div", "42")).not.toBeNull();
  });

  it("truncates a string figure and repeats it in a title, so a long value stays readable", () => {
    const view = render(<MetricCard label="Provider" value="anthropic/claude" />);
    const figure = view.getByText("div", "anthropic/claude");

    expect(figure.className).toContain("truncate");
    expect(figure.getAttribute("title")).toBe("anthropic/claude");
  });

  it("renders a non-string figure as-is, without truncation or a title", () => {
    const view = render(<MetricCard label="Coverage" value={<span>98%</span>} />);
    const figure = view.getByText("div", "98%");

    expect(figure.className).not.toContain("truncate");
    expect(figure.getAttribute("title")).toBeNull();
  });

  it("tints only the figure for the default tone, leaving the label muted", () => {
    const view = render(<MetricCard label="Keys" value="12" />);

    expect(view.getByText("div", "12").className).toContain("text-foreground");
  });

  it("tints the figure for an all-clear reading", () => {
    const view = render(<MetricCard label="Failures" value="0" tone="success" />);

    expect(view.getByText("div", "0").className).toContain("text-success");
  });

  it("tints the figure for an alarming reading", () => {
    const view = render(<MetricCard label="Failures" value="7" tone="danger" />);

    expect(view.getByText("div", "7").className).toContain("text-danger");
  });

  it("renders a decorative glyph when an icon is named", () => {
    const view = render(<MetricCard label="Budget" value="12" icon="gauge" />);
    const icon = view.get("svg");

    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("width")).toBe("14");
  });

  it("renders no glyph when no icon is named", () => {
    const view = render(<MetricCard label="Budget" value="12" />);

    expect(view.query("svg")).toBeNull();
  });

  it("renders the hint line under the figure when one is given", () => {
    const view = render(<MetricCard label="Budget" value="12" hint="of 100 requests" />);

    expect(view.getByText("p", "of 100 requests")).not.toBeNull();
  });

  it("renders no hint line when none is given", () => {
    const view = render(<MetricCard label="Budget" value="12" />);

    expect(view.query("p")).toBeNull();
  });

  it("renders a meter at the given percentage when progress is set", () => {
    const view = render(<MetricCard label="Budget" value="60" progress={60} />);
    const fill = view.all("span").at(-1);

    expect(fill?.style.width).toBe("60%");
  });

  it("uses the primary meter tone by default", () => {
    const view = render(<MetricCard label="Budget" value="60" progress={60} />);
    const fill = view.all("span").at(-1);

    expect(fill?.dataset.tone).toBe("primary");
  });

  it("uses the danger meter tone for an exceeded budget", () => {
    const view = render(
      <MetricCard label="Budget" value="120" progress={120} progressTone="danger" />,
    );
    const fill = view.all("span").at(-1);

    expect(fill?.dataset.tone).toBe("danger");
  });

  it("renders no meter when progress is absent", () => {
    const view = render(<MetricCard label="Budget" value="12" />);

    expect(view.query("[aria-hidden='true']")).toBeNull();
  });

  it("turns the hint into a link when the caller gives an address", () => {
    const view = render(
      <MetricCard label="Needs attention" value="2" hint="2 keys" hintHref="#/x" />,
    );

    expect(view.get('a[href="#/x"]').textContent).toBe("2 keys");
  });

  it("renders a quiet figure smaller and muted, with no mono weight", () => {
    const view = render(<MetricCard label="Tokens" value="Not reported" quiet />);
    const figure = view.getByText("div", "Not reported");

    expect(figure.className).toContain("text-muted-foreground");
    expect(figure.className).not.toContain("font-bold");
  });
});
