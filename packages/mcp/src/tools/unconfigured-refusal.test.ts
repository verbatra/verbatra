import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { describeUnconfiguredRefusal } from "./unconfigured-refusal.js";

describe("describeUnconfiguredRefusal", () => {
  it("leads with the error code, names the tool, and ends with the hint and project.doctor", () => {
    const message = describeUnconfiguredRefusal(
      "key.value",
      new SdkError("CONFIG_INVALID", "The verbatra configuration is invalid: /p/x.json broke"),
      "/p",
    );
    const lines = message.split("\n");

    expect(lines[0]).toBe("CONFIG_INVALID: The verbatra configuration is invalid: x.json broke");
    expect(lines[1]).toBe("key.value needs a usable project config, and this server has none.");
    expect(lines[2]).toMatch(/^Next step: Fix the config field .* Call project\.doctor/);
  });

  it("points at project.doctor alone when the error carries no hint", () => {
    const message = describeUnconfiguredRefusal("status.check", new Error("disk gone"), "/p");

    expect(message.split("\n")).toEqual([
      "disk gone",
      "status.check needs a usable project config, and this server has none.",
      expect.stringMatching(/^Next step: Call project\.doctor/),
    ]);
  });
});
