import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { projectRelativeMessage } from "./project-relative.js";

const ROOT = `${sep}work${sep}proj`;

describe("projectRelativeMessage", () => {
  it.each([
    [
      `The file at ${ROOT}${sep}locales${sep}de.json is bad.`,
      `The file at locales${sep}de.json is bad.`,
    ],
    [`Found ${ROOT}${sep}a.json and ${ROOT}${sep}b.json.`, "Found a.json and b.json."],
    [`Nothing to do in ${ROOT}: done.`, "Nothing to do in .: done."],
    [`(${ROOT})`, "(.)"],
  ])("rewrites %j", (message, expected) => {
    expect(projectRelativeMessage(message, ROOT)).toBe(expected);
  });

  it.each([
    `A sibling ${ROOT}-copy${sep}x.json stays absolute.`,
    `A longer name ${ROOT}s${sep}x.json stays absolute.`,
    `Outside ${sep}etc${sep}hosts stays absolute.`,
    "No path at all.",
  ])("leaves %j unchanged", (message) => {
    expect(projectRelativeMessage(message, ROOT)).toBe(message);
  });

  it("leaves an outside path that embeds the project root as a later segment unchanged", () => {
    const root = `${sep}app`;
    const outside = `${sep}usr${sep}lib${sep}app${sep}config.json`;

    expect(projectRelativeMessage(`ENOENT ${outside} (cwd ${root}${sep}a.json)`, root)).toBe(
      `ENOENT ${outside} (cwd a.json)`,
    );
  });

  it("leaves an outside path whose directory name is the project root unchanged", () => {
    const root = `${sep}src`;
    const outside = `${sep}usr${sep}src${sep}linux${sep}x.json`;

    expect(projectRelativeMessage(`Cannot read ${outside} from ${root}${sep}y.json`, root)).toBe(
      `Cannot read ${outside} from y.json`,
    );
  });

  it("leaves a URL whose path contains the project root unchanged", () => {
    const message = "fetched https://host/work/proj/x failed";

    expect(projectRelativeMessage(message, "/work/proj")).toBe(message);
  });

  it.each([
    ["a plus before the root", "a+/work/proj/x"],
    ["a doubled separator before the root", "https://host//work/proj/x"],
  ])("leaves a path with %s unchanged", (_name, path) => {
    const message = `fetched ${path} failed`;

    expect(projectRelativeMessage(message, "/work/proj")).toBe(message);
  });

  it("rewrites every inside occurrence and keeps every outside one in one message", () => {
    const root = `${sep}home${sep}u${sep}proj`;
    const backup = `${sep}backup${root}${sep}locales${sep}de.json`;

    expect(
      projectRelativeMessage(`bad ${root}${sep}locales${sep}de.json, also ${backup}`, root),
    ).toBe(`bad locales${sep}de.json, also ${backup}`);
  });

  it("accepts a project root given with a trailing separator", () => {
    expect(projectRelativeMessage(`at ${ROOT}${sep}a.json`, `${ROOT}${sep}`)).toBe("at a.json");
  });

  it.each(["", sep])("returns the message unchanged for the root %j", (root) => {
    const message = `at ${sep}work${sep}a.json`;

    expect(projectRelativeMessage(message, root)).toBe(message);
  });
});
