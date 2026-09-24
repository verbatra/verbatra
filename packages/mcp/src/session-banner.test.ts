import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_DOCS_URL,
  mcpReadyLine,
  mcpStoppedLine,
  mcpTerminalHint,
  projectLabel,
} from "./session-banner.js";

describe("projectLabel", () => {
  const base = resolve("/work/app");

  it("sees through a symlinked base, as macOS temp directories are", () => {
    const real = mkdtempSync(join(tmpdir(), "verbatra-label-"));
    mkdirSync(join(real, "web"));
    const link = `${real}-link`;
    symlinkSync(real, link);

    expect(projectLabel(join(link, "web"), real)).toBe("web");
    expect(projectLabel(link, real)).toBe(".");
  });

  it("falls back to the given paths when they do not exist", () => {
    expect(projectLabel(join(base, "missing"), base)).toBe("missing");
  });

  it.each([
    ["the base itself", base, "."],
    ["a directory inside it", join(base, "web"), "web"],
    ["its parent", resolve("/work"), resolve("/work")],
    ["a sibling", resolve("/work/other"), resolve("/work/other")],
  ])("labels %s", (_label, cwd, expected) => {
    expect(projectLabel(cwd, base)).toBe(expected);
  });
});

describe("mcpReadyLine", () => {
  it("names the project and the spend state", () => {
    expect(mcpReadyLine("web", false)).toBe(
      "verbatra MCP server running on stdio (project web, spend tools off)",
    );
    expect(mcpReadyLine(".", true)).toBe(
      "verbatra MCP server running on stdio (project ., spend tools on)",
    );
  });
});

describe("mcpTerminalHint", () => {
  it("shows how to launch, inspect and stop the standalone server", () => {
    const hint = mcpTerminalHint(["-y", "@verbatra/mcp"]).join("\n");

    expect(hint).toContain(MCP_DOCS_URL);
    expect(hint).toContain('command "npx", args ["-y", "@verbatra/mcp"]');
    expect(hint).toContain("npx @modelcontextprotocol/inspector npx -y @verbatra/mcp");
    expect(hint).toContain("Ctrl-C");
    expect(hint).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it("uses the launch arguments it is given, such as the CLI subcommand", () => {
    const hint = mcpTerminalHint(["verbatra", "mcp"]).join("\n");

    expect(hint).toContain('command "npx", args ["verbatra", "mcp"]');
    expect(hint).toContain("npx @modelcontextprotocol/inspector npx verbatra mcp");
  });
});

describe("mcpStoppedLine", () => {
  it("names why the server stopped", () => {
    expect(mcpStoppedLine("stdin-closed")).toBe(
      "verbatra MCP server stopped (client closed stdin)",
    );
    expect(mcpStoppedLine("signal")).toBe("verbatra MCP server stopped (interrupted)");
  });
});

describe("package exports", () => {
  it("publishes the banner builders from the package root", async () => {
    const root = await import("./index.js");

    expect(root.mcpReadyLine).toBe(mcpReadyLine);
    expect(root.mcpTerminalHint).toBe(mcpTerminalHint);
    expect(root.mcpStoppedLine).toBe(mcpStoppedLine);
    expect(root.projectLabel).toBe(projectLabel);
  });
});
