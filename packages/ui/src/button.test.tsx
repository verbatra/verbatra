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

const SIZES: readonly ButtonSize[] = ["xs", "sm", "md", "lg"];

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

  it("sets the compact size to the dense row-action metrics", () => {
    const names = buttonClasses({ size: "xs" }).split(" ");

    expect(names).toContain("px-2");
    expect(names).toContain("py-1");
    expect(names).toContain("text-xs");
    expect(names).toContain("font-medium");
    expect(names).not.toContain("font-semibold");
  });

  it("gives the component's borderless variants the same border box as the bordered ones", () => {
    for (const variant of ["primary", "ghost", "danger"] as const) {
      const view = render(<Button variant={variant}>x</Button>);
      const names = view.get("button").className.split(" ");

      expect(names, variant).toContain("border");
      expect(names, variant).toContain("border-transparent");
    }
    for (const variant of [
      "secondary",
      "outline",
      "secondary-success",
      "secondary-danger",
    ] as const) {
      expect(render(<Button variant={variant}>x</Button>).get("button").className).not.toContain(
        "border-transparent",
      );
    }
  });

  it("leaves the link class string unboxed, so a site link keeps its own box", () => {
    for (const variant of ["primary", "ghost"] as const) {
      expect(buttonClasses({ variant }).split(" ")).not.toContain("border-transparent");
    }
  });

  it("carries the reserved text on its slot and leaves the label text unchanged", () => {
    const view = render(<Button reserve="Approving…">Approve</Button>);
    const slot = view.get("[data-reserve]");

    expect(slot.dataset.reserve).toBe("Approving…");
    expect(view.get("button").textContent).toBe("Approve");
    expect(view.get("button").getAttribute("aria-label")).toBeNull();
  });

  it("renders a trailing slot after the reserved label, outside it", () => {
    const view = render(
      <Button reserve="Retranslating…" trailing={<i data-slot="">5s</i>}>
        Retranslate
      </Button>,
    );

    expect(view.get("[data-reserve]").contains(view.get("[data-slot]"))).toBe(false);
    expect(view.get("button").lastElementChild?.tagName).toBe("I");
  });

  it("renders no reserve wrapper unless asked", () => {
    expect(render(<Button>Approve</Button>).query("[data-reserve]")).toBeNull();
  });

  it("keeps the label on one line and fades a disabled button", () => {
    const names = buttonClasses().split(" ");

    expect(names).toContain("whitespace-nowrap");
    expect(names).toContain("disabled:opacity-60");
  });

  it("keeps its own data attributes even when a caller passes the same names", () => {
    const view = render(
      <Button variant="danger" {...{ "data-variant": "x", "data-size": "x" }}>
        x
      </Button>,
    );

    expect(view.get("button").dataset.variant).toBe("danger");
    expect(view.get("button").dataset.size).toBe("sm");
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
