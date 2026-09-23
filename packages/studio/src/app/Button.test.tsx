// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";
import { click, render } from "./test-support.js";

describe("Button", () => {
  it("defaults to a non-submitting button so a caller never posts a form by accident", () => {
    const view = render(<Button>Save</Button>);

    expect(view.get("button").getAttribute("type")).toBe("button");
  });

  it("honors an explicit type over the default", () => {
    const view = render(<Button type="submit">Save</Button>);

    expect(view.get("button").getAttribute("type")).toBe("submit");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    const view = render(<Button onClick={onClick}>Approve</Button>);

    click(view.get("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick while disabled", () => {
    const onClick = vi.fn();
    const view = render(
      <Button disabled onClick={onClick}>
        Approve
      </Button>,
    );

    click(view.get("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the secondary variant at the small size by default", () => {
    const view = render(<Button>Edit</Button>);
    const className = view.get("button").className;

    expect(className).toContain("bg-card");
    expect(className).toContain("text-xs");
  });

  it("applies the primary and ghost variants and the medium size on request", () => {
    const primary = render(<Button variant="primary">Go</Button>);
    const ghost = render(
      <Button variant="ghost" size="md">
        Go
      </Button>,
    );

    expect(primary.get("button").className).toContain("bg-primary");
    expect(ghost.get("button").className).toContain("bg-transparent");
    expect(ghost.get("button").className).toContain("text-sm");
  });

  it("fills the danger variant with the paired danger tokens", () => {
    const danger = render(<Button variant="danger">Remove</Button>);

    expect(danger.get("button").className).toContain("bg-danger");
    expect(danger.get("button").className).toContain("text-danger-foreground");
  });

  it("merges a caller className onto the variant classes", () => {
    const view = render(<Button className="text-danger">Reject</Button>);

    expect(view.get("button").className).toContain("text-danger");
  });

  it("forwards the remaining native attributes, so a caller can name an icon-only button", () => {
    const view = render(<Button aria-label="Close the drawer">x</Button>);

    expect(view.get("button").getAttribute("aria-label")).toBe("Close the drawer");
  });
});
