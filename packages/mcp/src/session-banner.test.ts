import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_DOCS_URL, projectLabel, readyLines, stoppedLine } from "./session-banner.js";

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

describe("readyLines", () => {
  it("is one ready line naming the project and spend state when a client launches the server", () => {
    expect(readyLines("web", false, false)).toEqual([
      "verbatra MCP server running on stdio (project web, spend tools off)",
    ]);
  });

  it("adds how to launch, inspect and stop the server when stdin is a terminal", () => {
    const lines = readyLines(".", true, true);

    expect(lines[0]).toBe("verbatra MCP server running on stdio (project ., spend tools on)");
    const hint = lines.slice(1).join("\n");
    expect(hint).toContain(MCP_DOCS_URL);
    expect(hint).toContain("npx @modelcontextprotocol/inspector npx -y @verbatra/mcp");
    expect(hint).toContain("Ctrl-C");
    expect(lines.join("\n")).toMatch(/^[\x20-\x7e\n]+$/);
  });
});

describe("stoppedLine", () => {
  it("names why the server stopped", () => {
    expect(stoppedLine("stdin-closed")).toBe("verbatra MCP server stopped (client closed stdin)");
    expect(stoppedLine("signal")).toBe("verbatra MCP server stopped (interrupted)");
  });
});
