// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

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
