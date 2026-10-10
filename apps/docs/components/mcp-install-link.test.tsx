// @vitest-environment jsdom

import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mcpInstallLink } from "@/lib/mcp-install-links";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    `${key}:${values?.client ?? ""}`,
}));

const { McpInstallLink } = await import("./mcp-install-link");

function link(): HTMLAnchorElement | null {
  const markup = renderToStaticMarkup(<McpInstallLink client="vscode" />);
  return new DOMParser().parseFromString(markup, "text/html").querySelector("a");
}

describe("McpInstallLink", () => {
  it("is a plain anchor to the VS Code install link", () => {
    const anchor = link();
    expect(anchor?.getAttribute("href")).toBe(mcpInstallLink(AGENT_CLIENT_CONFIGS, "vscode"));
    expect(anchor?.getAttribute("onclick")).toBeNull();
    expect(anchor?.getAttribute("target")).toBeNull();
  });

  it("names the client in its label", () => {
    expect(link()?.textContent).toBe("label:VS Code");
  });

  it("is a secondary button with a 44px target, counted by an Umami data attribute instead of a script", () => {
    const anchor = link();
    expect(anchor?.className).toContain("border-fd-border");
    expect(anchor?.classList.contains("min-h-11")).toBe(true);
    expect(anchor?.dataset.umamiEvent).toBe("install-mcp");
    expect(anchor?.dataset.umamiEventClient).toBe("vscode");
    expect(anchor?.dataset.umamiEventLocation).toBe("docs-page");
  });
});
