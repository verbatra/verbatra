import { SUPPORTED_FORMATS } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { localeLimits, planReads, RECORD_LIMITS } from "./key-history-limits.js";

const KIB = 1024;
const MIB = 1024 * KIB;
const SMALL = { fileCap: 100, budget: 250 };

describe("the limits of keyHistory", () => {
  it("puts yaml and every XML family format in the slow class and the rest in the fast class", () => {
    const slow = SUPPORTED_FORMATS.filter((format) => localeLimits(format).fileCap === 512 * KIB);
    const fast = SUPPORTED_FORMATS.filter((format) => localeLimits(format).fileCap === 4 * MIB);

    expect(slow.sort()).toEqual(["android-xml", "apple-strings", "resx", "xliff", "yaml"]);
    expect(fast).toHaveLength(SUPPORTED_FORMATS.length - slow.length);
    expect(localeLimits("yaml")).toEqual({ fileCap: 512 * KIB, budget: 16 * MIB });
    expect(localeLimits("i18next-json")).toEqual({ fileCap: 4 * MIB, budget: 128 * MIB });
  });

  it("caps a lock file and a provenance file at 4 MiB each and 128 MiB together", () => {
    expect(RECORD_LIMITS).toEqual({ fileCap: 4 * MIB, budget: 128 * MIB });
  });
});

describe("planReads", () => {
  it("reads what is within the cap and the budget", () => {
    expect(planReads([100, 50, 100], SMALL)).toEqual(["read", "read", "read"]);
  });

  it("refuses a file one byte over the cap and spends nothing on it", () => {
    expect(planReads([101, 100, 100], SMALL)).toEqual(["over-cap", "read", "read"]);
  });

  it("spends nothing on an entry with nothing to read", () => {
    expect(planReads([null, null, 100, 100, 50], SMALL)).toEqual([
      "nothing",
      "nothing",
      "read",
      "read",
      "read",
    ]);
  });

  it("reads up to exactly the budget and cuts at the first file that would pass it", () => {
    expect(planReads([100, 100, 50], SMALL)).toEqual(["read", "read", "read"]);
    expect(planReads([100, 100, 51, 1, 1], SMALL)).toEqual(["read", "read", "cut", "cut", "cut"]);
  });

  it("cuts everything older than the cut, whatever it is", () => {
    expect(planReads([100, 100, 100, null, 101, 1], SMALL)).toEqual([
      "read",
      "read",
      "cut",
      "cut",
      "cut",
      "cut",
    ]);
  });

  it("cuts at an entry that was never measured and everything after it", () => {
    expect(planReads([10, undefined, 10, null], SMALL)).toEqual(["read", "cut", "cut", "cut"]);
  });

  it("gives the same plan for the same sizes however often it is asked", () => {
    const sizes = [90, 100, null, 101, 80, 70, 60];

    expect(planReads(sizes, SMALL)).toEqual(planReads([...sizes], SMALL));
    expect(planReads(sizes, SMALL)).toEqual([
      "read",
      "read",
      "nothing",
      "over-cap",
      "cut",
      "cut",
      "cut",
    ]);
  });
});
