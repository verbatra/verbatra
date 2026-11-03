// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Button, type ButtonSize, type ButtonVariant, buttonClasses } from "./button.tsx";
import { click, render } from "./test-support.tsx";

const VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "secondary-success",
  "secondary-danger",
  "danger",
];

const SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];

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

  it("cannot be pressed while disabled", () => {
    const onClick = vi.fn();
    const view = render(
      <Button disabled onClick={onClick}>
        Approve
      </Button>,
    );

    click(view.get("button"));

    expect(view.get<HTMLButtonElement>("button").disabled).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the secondary variant at the small size by default", () => {
    const view = render(<Button>Edit</Button>);

    expect(view.get("button").dataset.variant).toBe("secondary");
    expect(view.get("button").dataset.size).toBe("sm");
  });

  it.each(VARIANTS)("reports the %s variant", (variant) => {
    const view = render(<Button variant={variant}>Go</Button>);

    expect(view.get("button").dataset.variant).toBe(variant);
  });

  it.each(SIZES)("reports the %s size", (size) => {
    const view = render(<Button size={size}>Go</Button>);

    expect(view.get("button").dataset.size).toBe(size);
  });

  it("carries the stylesheet hooks of the look each variant belongs to", () => {
    const hook = (variant: ButtonVariant): string[] =>
      buttonClasses({ variant })
        .split(" ")
        .filter((name) => name.startsWith("vk-btn-"));

    expect(hook("primary")).toEqual(["vk-btn-primary"]);
    expect(hook("danger")).toEqual(["vk-btn-danger"]);
    expect(hook("ghost")).toEqual(["vk-btn-ghost"]);
    for (const variant of [
      "secondary",
      "outline",
      "secondary-success",
      "secondary-danger",
    ] as const) {
      expect(hook(variant)).toEqual(["vk-btn-secondary"]);
    }
  });

  it("tints the status variants with their own tokens", () => {
    expect(buttonClasses({ variant: "secondary-success" })).toContain("text-(--status-success)");
    expect(buttonClasses({ variant: "secondary-danger" })).toContain("text-(--status-danger)");
    expect(buttonClasses({ variant: "danger" })).toContain("text-(--status-danger-fg)");
  });

  it("draws a bordered variant's boundary in the faint text token first", () => {
    for (const variant of [
      "secondary",
      "outline",
      "secondary-success",
      "secondary-danger",
    ] as const) {
      expect(/(?:^|\s)border-\((--[\w-]+)\)/.exec(buttonClasses({ variant }))?.[1]).toBe(
        "--text-faint",
      );
    }
  });

  it("lets a caller class win over a conflicting size class", () => {
    const view = render(
      <Button variant="ghost" className="p-1.5">
        x
      </Button>,
    );
    const names = view.get("button").className.split(" ");

    expect(names).toContain("p-1.5");
    expect(names).not.toContain("px-3");
  });

  it("shows a trailing arrow only when asked, hidden from assistive technology", () => {
    const plain = render(<Button>Next</Button>);
    const arrowed = render(<Button trailingArrow>Next</Button>);

    expect(plain.query("[aria-hidden]")).toBeNull();
    expect(arrowed.get("[aria-hidden]").textContent).toBe("→");
  });

  it("forwards the remaining native attributes, so a caller can name an icon-only button", () => {
    const view = render(<Button aria-label="Close the drawer">x</Button>);

    expect(view.get("button").getAttribute("aria-label")).toBe("Close the drawer");
  });
});

describe("buttonClasses", () => {
  it("defaults to the secondary variant at the small size", () => {
    expect(buttonClasses()).toBe(buttonClasses({ variant: "secondary", size: "sm" }));
  });

  it("appends the caller className", () => {
    expect(buttonClasses({ className: "mt-4" }).split(" ")).toContain("mt-4");
  });
});
