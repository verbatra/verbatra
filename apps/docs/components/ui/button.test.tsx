// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { contrast, themeTokens } from "@/test-support/contrast";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: ComponentProps<"a"> & { href: string; prefetch?: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: Button, buttonClasses } = await import("./button");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Button as a link", () => {
  it("passes click handlers through to the link", () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const onAuxClick = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    act(() =>
      createRoot(container).render(
        <Button href="/docs" onClick={onClick} onAuxClick={onAuxClick}>
          Docs
        </Button>,
      ),
    );
    const link = container.querySelector("a");
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      link?.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onAuxClick).toHaveBeenCalledTimes(1);
  });
});

describe("buttonClasses", () => {
  it("names the primary variant, so forced colors can give its fill a boundary", () => {
    expect(buttonClasses("primary").split(" ")).toContain("vk-btn-primary");
    expect(buttonClasses("secondary").split(" ")).not.toContain("vk-btn-primary");
  });
});

describe("button treatment", () => {
  const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

  it("holds the primary label at 4.5:1 on both ends of the fill in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const tokens = themeTokens()[theme];
      for (const end of ["--accent-fill", "--btn-fill-end"]) {
        expect(
          contrast(tokens, "--accent-fill-fg", end),
          `${end} (${theme})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("paints the primary fill from the stylesheet, so buttonClasses alone gets it", () => {
    const container = document.createElement("div");
    act(() => createRoot(container).render(<Button>Go</Button>));
    expect(container.querySelector("button")?.getAttribute("style")).toBeNull();
    expect(css).toMatch(
      /\.vk-btn-primary \{\s*background: linear-gradient\(180deg, var\(--accent-fill\), var\(--btn-fill-end\)\);/,
    );
  });

  it("moves, lifts and presses only where motion is welcome, inside the components layer", () => {
    const layer = css.slice(css.indexOf("@layer components {"));
    const motion =
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.vk-btn \{[\s\S]*?\n {2}\}\n/.exec(
        layer,
      )?.[0];
    expect(motion).toContain("transition-property");
    expect(motion).toContain("translateY(-1px)");
    expect(motion).toContain("translateY(1px)");
    expect(css.replace(motion ?? "", "")).not.toMatch(/\.vk-btn[^{]*\{[^}]*transform:/);
  });

  it("applies the primary glow and the lift only where hover exists", () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.vk-btn-primary:hover \{/);
    expect(css).toMatch(
      /@media \(hover: hover\) \{\s*\.vk-btn:is\(\.vk-btn-primary, \.vk-btn-secondary\):hover \{/,
    );
  });

  it("tints the ghost and fills the secondary on hover", () => {
    expect(buttonClasses("ghost")).toContain("hover:bg-(--surface-hover)");
    expect(buttonClasses("secondary")).toContain("bg-(--surface-card)");
    expect(buttonClasses("secondary")).toContain("hover:border-(--accent)");
  });
});
