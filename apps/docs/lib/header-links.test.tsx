import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { describe, expect, it } from "vitest";
import { navLinks } from "./header-links";

describe("navLinks", () => {
  it("keeps text and icon links as plain strings with their url, external flag and active mode", () => {
    const items: LinkItemType[] = [
      { text: "Docs", url: "/docs", active: "nested-url" },
      {
        type: "icon",
        label: "GitHub",
        text: "GitHub",
        icon: <i />,
        url: "https://x.test",
        external: true,
      },
    ];
    expect(navLinks(items)).toEqual([
      { href: "/docs", text: "Docs", external: false, active: "nested-url" },
      { href: "https://x.test", text: "GitHub", external: true, active: undefined },
    ]);
  });

  it("drops custom entries, menus, items without a url and non-string labels", () => {
    const items = [
      { type: "custom", children: <i /> },
      { type: "menu", text: "Menu", items: [] },
      { text: "No url" },
      { text: <b>Rich</b>, url: "/rich" },
      { type: "icon", icon: <i />, text: "x", url: "/nolabel" },
    ] as unknown as LinkItemType[];
    expect(navLinks(items)).toEqual([]);
  });
});
