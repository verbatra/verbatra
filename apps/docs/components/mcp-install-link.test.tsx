// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MCP_INSTALL_CLIENTS, MCP_INSTALL_LINKS } from "@/lib/mcp-install-links";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    `${key}:${values?.client ?? ""}`,
}));

const { McpInstallLink, McpInstallLinks } = await import("./mcp-install-link");

function link(client: (typeof MCP_INSTALL_CLIENTS)[number]): HTMLAnchorElement | null {
  const markup = renderToStaticMarkup(<McpInstallLink client={client} />);
  return new DOMParser().parseFromString(markup, "text/html").querySelector("a");
}

describe("McpInstallLink", () => {
  it.each(MCP_INSTALL_CLIENTS)("is a plain anchor to the %s install link", (client) => {
    const anchor = link(client);
    expect(anchor?.getAttribute("href")).toBe(MCP_INSTALL_LINKS[client]);
    expect(anchor?.getAttribute("onclick")).toBeNull();
    expect(anchor?.getAttribute("target")).toBeNull();
  });

  it("names the client in its label", () => {
    expect(link("cursor")?.textContent).toBe("label:Cursor");
    expect(link("vscode")?.textContent).toBe("label:VS Code");
  });

  it("is a secondary button with a 44px target, counted by an Umami data attribute instead of a script", () => {
    const anchor = link("vscode");
    expect(anchor?.className).toContain("border-fd-border");
    expect(anchor?.classList.contains("min-h-11")).toBe(true);
    expect(anchor?.dataset.umamiEvent).toBe("mcp-install");
    expect(anchor?.dataset.umamiEventClient).toBe("vscode");
  });

  it("renders the pair as one row of both links, Cursor first", () => {
    const markup = renderToStaticMarkup(<McpInstallLinks />);
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const hrefs = [...doc.querySelectorAll("p > a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toEqual([MCP_INSTALL_LINKS.cursor, MCP_INSTALL_LINKS.vscode]);
    expect(doc.querySelector("p")?.classList.contains("flex-wrap")).toBe(true);
  });
});
