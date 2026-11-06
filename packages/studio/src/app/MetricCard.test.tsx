// @vitest-environment jsdom
import { microLabelClassName } from "@verbatra/ui";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard.js";
import { metricCard, metricFigure, metricHint, render } from "./test-support.js";

const LONG_LABEL = "Average coverage across every configured target locale of this project";
const LONG_VALUE = "anthropic/claude-with-a-very-long-model-identifier-that-has-no-break-point";

describe("MetricCard", () => {
  it("names the card by its label and shows the figure under it", () => {
    const view = render(<MetricCard label="Missing keys" value="42" />);

    expect(metricCard(view, "Missing keys").getAttribute("role")).toBe("group");
    expect(metricFigure(view, "Missing keys").textContent).toBe("42");
  });

  it("styles the label as the micro-label eyebrow", () => {
    const view = render(<MetricCard label="Missing keys" value="42" />);
    const labelId = metricCard(view, "Missing keys").getAttribute("aria-labelledby") ?? "";

    expect(document.getElementById(labelId)?.className).toContain(microLabelClassName);
  });

  it("lets a long label wrap instead of truncating it", () => {
    const view = render(<MetricCard label={LONG_LABEL} value="3" icon="gauge" />);
    const labelId = metricCard(view, LONG_LABEL).getAttribute("aria-labelledby") ?? "";
    const label = document.getElementById(labelId);

    expect(label?.className).toContain("break-words");
    expect(label?.className).not.toContain("truncate");
    expect(label?.className).toContain("min-w-0");
  });

  it("lets a long string figure wrap instead of truncating it, with no native title", () => {
    const view = render(<MetricCard label="Provider" value={LONG_VALUE} />);
    const figure = metricFigure(view, "Provider");

    expect(figure.textContent).toBe(LONG_VALUE);
    expect(figure.className).toContain("break-words");
    expect(figure.className).not.toContain("truncate");
    expect(view.container.querySelector("[title]")).toBeNull();
  });

  it("marks a string figure as a figure set in tabular sans numerals, not mono", () => {
    const view = render(<MetricCard label="Keys" value="1,234" />);
    const figure = metricFigure(view, "Keys");

    expect(figure.hasAttribute("data-figure")).toBe(true);
    expect(figure.className).toContain("tabular-nums");
    expect(figure.className).not.toContain("font-mono");
  });

  it("does not mark a node figure or a quiet reading as a figure", () => {
    const view = render(
      <>
        <MetricCard label="Coverage" value={<span>98%</span>} />
        <MetricCard label="Tokens" value="Not reported" quiet />
      </>,
    );

    expect(metricFigure(view, "Coverage").hasAttribute("data-figure")).toBe(false);
    expect(metricFigure(view, "Tokens").hasAttribute("data-figure")).toBe(false);
  });

  it("renders a non-string figure as-is, without a title", () => {
    const view = render(<MetricCard label="Coverage" value={<span>98%</span>} />);
    const figure = metricFigure(view, "Coverage");

    expect(figure.textContent).toBe("98%");
    expect(figure.getAttribute("title")).toBeNull();
  });

  it("tints only the figure for the default tone, leaving the label muted", () => {
    const view = render(<MetricCard label="Keys" value="12" />);

    expect(metricFigure(view, "Keys").className).toContain("text-foreground");
  });

  it("tints the figure for an all-clear reading", () => {
    const view = render(<MetricCard label="Failures" value="0" tone="success" />);

    expect(metricFigure(view, "Failures").className).toContain("text-success");
  });

  it("tints the figure for an alarming reading", () => {
    const view = render(<MetricCard label="Failures" value="7" tone="danger" />);

    expect(metricFigure(view, "Failures").className).toContain("text-danger");
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

    expect(metricHint(view, "Budget")).toBe("of 100 requests");
  });

  it("renders no hint line when none is given", () => {
    const view = render(<MetricCard label="Budget" value="12" />);

    expect(metricHint(view, "Budget")).toBeNull();
  });

  it("renders a meter at the given percentage when progress is set", () => {
    const view = render(<MetricCard label="Budget" value="60" progress={60} />);
    const fill = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");

    expect(fill?.style.width).toBe("60%");
  });

  it("uses the primary meter tone by default", () => {
    const view = render(<MetricCard label="Budget" value="60" progress={60} />);
    const fill = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");

    expect(fill?.dataset.tone).toBe("primary");
  });

  it("uses the danger meter tone for an exceeded budget", () => {
    const view = render(
      <MetricCard label="Budget" value="120" progress={120} progressTone="danger" />,
    );
    const fill = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");

    expect(fill?.dataset.tone).toBe("danger");
  });

  it("renders no meter when progress is absent", () => {
    const view = render(<MetricCard label="Budget" value="12" />);

    expect(metricCard(view, "Budget").querySelector("[data-tone]")).toBeNull();
  });

  it("turns the hint into a link when the caller gives an address", () => {
    const view = render(
      <MetricCard label="Needs attention" value="2" hint="2 keys" hintHref="#/x" />,
    );

    expect(view.get('a[href="#/x"]').textContent).toBe("2 keys");
  });

  it("renders a quiet figure smaller and muted, with no bold weight", () => {
    const view = render(<MetricCard label="Tokens" value="Not reported" quiet />);
    const figure = metricFigure(view, "Tokens");

    expect(figure.className).toContain("text-muted-foreground");
    expect(figure.className).not.toContain("font-bold");
  });
});
