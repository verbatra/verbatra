import { describe, expect, it } from "vitest";
import { resolveCapabilities } from "./capabilities.js";
import { baseStudioConfig } from "./test-support.js";

describe("resolveCapabilities", () => {
  it("grants spend when the flag is set and a translation provider is configured", () => {
    expect(resolveCapabilities(true, baseStudioConfig())).toEqual({
      spend: true,
      writeToDisk: true,
    });
  });

  it("names the missing flag as the reason when spend was never granted", () => {
    expect(resolveCapabilities(false, baseStudioConfig())).toEqual({
      spend: false,
      spendWithheld: "flag",
      writeToDisk: true,
    });
  });

  it("names the policy as the reason when provider none withholds a granted spend", () => {
    const config = baseStudioConfig({ provider: { id: "none", options: {} } });
    expect(resolveCapabilities(true, config)).toEqual({
      spend: false,
      spendWithheld: "policy",
      writeToDisk: true,
    });
  });
});
