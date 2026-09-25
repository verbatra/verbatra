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

  it("accepts a project root given with a trailing separator", () => {
    expect(projectRelativeMessage(`at ${ROOT}${sep}a.json`, `${ROOT}${sep}`)).toBe("at a.json");
  });

  it.each(["", sep])("returns the message unchanged for the root %j", (root) => {
    const message = `at ${sep}work${sep}a.json`;

    expect(projectRelativeMessage(message, root)).toBe(message);
  });
});
