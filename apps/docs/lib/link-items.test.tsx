// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("fumadocs-core/link", () => ({
  default: ({ children, external, ...props }: ComponentProps<"a"> & { external?: boolean }) => (
    <a data-external={external ? "" : undefined} {...props}>
      {children}
    </a>
  ),
}));

const { isLinkItemActive, LinkItem } = await import("./link-items");

describe("isLinkItemActive", () => {
  it.each([
    [{ text: "Docs", url: "/docs" }, "/docs", true],
    [{ text: "Docs", url: "/docs/" }, "/docs", true],
    [{ text: "Docs", url: "/docs" }, "/docs/cli", false],
    [{ text: "Docs", url: "/docs", active: "nested-url" as const }, "/docs/cli", true],
    [{ text: "Docs", url: "/docs", active: "nested-url" as const }, "/docsx", false],
    [{ text: "Docs", url: "/docs", active: "none" as const }, "/docs", false],
    [{ type: "custom" as const, children: null }, "/docs", false],
  ])("matches %o on %s as %s, like the fumadocs layout", (item, pathname, active) => {
    expect(isLinkItemActive(item, pathname)).toBe(active);
  });
});

describe("LinkItem", () => {
  it("links the item and marks whether it is active", () => {
    const html = renderToStaticMarkup(
      <LinkItem
        item={{
          type: "icon",
          label: "GitHub",
          text: "GitHub",
          icon: null,
          url: "/gh",
          external: true,
        }}
        pathname="/gh"
      >
        GitHub
      </LinkItem>,
    );
    expect(html).toBe('<a data-external="" href="/gh" data-active="true">GitHub</a>');
  });
});
