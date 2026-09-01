import { describe, expect, it } from "vitest";
import { parseArgs } from "./bin.js";

describe("parseArgs", () => {
  it("reads --cwd and --config values", () => {
    const options = parseArgs(["--cwd", "/tmp/project", "--config", "verbatra.config.ts"]);

    expect(options).toMatchObject({ cwd: "/tmp/project", configPath: "verbatra.config.ts" });
  });

  it("sets allowSpend when --allow-spend is present", () => {
    const options = parseArgs(["--allow-spend"]);

    expect(options.allowSpend).toBe(true);
  });

  it("throws a clear error when --cwd is followed by another flag instead of a value", () => {
    expect(() => parseArgs(["--cwd", "--allow-spend"])).toThrow(/missing value for --cwd/i);
  });

  it("throws a clear error when --config is the last argument", () => {
    expect(() => parseArgs(["--config"])).toThrow(/missing value for --config/i);
  });
});
