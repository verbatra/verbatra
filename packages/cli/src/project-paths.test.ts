import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escapesProject, linkRefusal, writeProjectFile } from "./project-paths.js";

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verbatra-paths-"));
  dir = join(root, "project");
  mkdirSync(dir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("writeProjectFile", () => {
  it("creates missing parent directories and writes the content", () => {
    writeProjectFile(dir, ".cursor/mcp.json", "{}\n", "never-follow");
    expect(readFileSync(join(dir, ".cursor/mcp.json"), "utf8")).toBe("{}\n");
  });

  it("truncates an existing file", () => {
    writeFileSync(join(dir, "a.json"), "a much longer previous content\n");
    writeProjectFile(dir, "a.json", "{}\n", "never-follow");
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("{}\n");
  });

  it.runIf(process.platform !== "win32")(
    "never follows a final symbolic link, even one created after every check",
    () => {
      const outside = join(root, "outside.json");
      writeFileSync(outside, "kept\n");
      symlinkSync(outside, join(dir, "mcp.json"));
      expect(() => writeProjectFile(dir, "mcp.json", "{}\n", "never-follow")).toThrow(
        expect.objectContaining({ code: "ELOOP" }),
      );
      expect(readFileSync(outside, "utf8")).toBe("kept\n");
    },
  );

  it("follows a link that stays inside the project under stay-inside", () => {
    writeFileSync(join(dir, "real"), "old\n");
    symlinkSync(join(dir, "real"), join(dir, "alias"));
    writeProjectFile(dir, "alias", "new\n", "stay-inside");
    expect(readFileSync(join(dir, "real"), "utf8")).toBe("new\n");
  });
});

describe("linkRefusal and escapesProject", () => {
  it("names the first symbolic link on the path under never-follow", () => {
    mkdirSync(join(root, "elsewhere"));
    symlinkSync(join(root, "elsewhere"), join(dir, ".vscode"));
    expect(linkRefusal(dir, ".vscode/mcp.json", "never-follow")).toBe(
      "sits behind the symbolic link .vscode",
    );
    expect(linkRefusal(dir, ".cursor/mcp.json", "never-follow")).toBeUndefined();
  });

  it("refuses only links that leave the project, or lead nowhere, under stay-inside", () => {
    writeFileSync(join(dir, "inside"), "x\n");
    writeFileSync(join(root, "outside"), "x\n");
    symlinkSync(join(dir, "inside"), join(dir, "a"));
    symlinkSync(join(root, "outside"), join(dir, "b"));
    symlinkSync(join(root, "missing"), join(dir, "c"));
    expect(linkRefusal(dir, "a", "stay-inside")).toBeUndefined();
    expect(linkRefusal(dir, "b", "stay-inside")).toContain("does not resolve inside the project");
    expect(escapesProject(dir, "c")).toBe(true);
    expect(escapesProject(dir, "absent")).toBe(false);
    expect(existsSync(join(root, "missing"))).toBe(false);
  });
});
