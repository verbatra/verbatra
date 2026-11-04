// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar.tsx";
import { render } from "./test-support.tsx";

function fill(view: ReturnType<typeof render>): HTMLElement {
  return view.get("[data-tone]");
}

describe("ProgressBar", () => {
  it("is decorative by default, so a bar beside its own number is not announced twice", () => {
    const view = render(<ProgressBar percent={40} />);

    expect(view.query("[role='progressbar']")).toBeNull();
    expect(view.get("span").getAttribute("aria-hidden")).toBe("true");
  });

  it("becomes a progressbar over a fixed 0-100 range when it carries the value alone", () => {
    const view = render(<ProgressBar percent={40} ariaLabel="Budget" />);
    const bar = view.get("[role='progressbar']");

    expect(bar.getAttribute("aria-label")).toBe("Budget");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.hasAttribute("aria-hidden")).toBe(false);
  });

  it("fills the track to the given percentage", () => {
    expect(fill(render(<ProgressBar percent={31} />)).style.width).toBe("31%");
  });

  it("clamps below 0 and above 100", () => {
    expect(fill(render(<ProgressBar percent={-5} />)).style.width).toBe("0%");
    const over = render(<ProgressBar percent={140} ariaLabel="Budget" />);
    expect(fill(over).style.width).toBe("100%");
    expect(over.get("[role='progressbar']").getAttribute("aria-valuenow")).toBe("100");
  });

  it("reports the primary tone by default and the danger tone on request", () => {
    expect(fill(render(<ProgressBar percent={10} />)).dataset.tone).toBe("primary");
    expect(fill(render(<ProgressBar percent={10} tone="danger" />)).dataset.tone).toBe("danger");
  });

  it("merges a caller className onto the track", () => {
    const view = render(<ProgressBar percent={10} className="h-3" />);

    expect(view.get("span").className.split(" ")).toContain("h-3");
  });
});
