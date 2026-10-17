import { describe, expect, it, vi } from "vitest";
import { makeContext, makeProject, makeStubProvider } from "../test-support.js";
import { estimateTool } from "./estimate.js";
import { reviewQueueTool } from "./review-queue.js";
import { statusCheckTool } from "./status-check.js";
import { statusDiffTool } from "./status-diff.js";
import { translatePendingTool } from "./translate-pending.js";

const inputs = vi.hoisted(() => new Map<string, object[]>());

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  function recording<Input extends object, Rest extends unknown[], Result>(
    name: string,
    fn: (input: Input, ...rest: Rest) => Promise<Result>,
  ): (input: Input, ...rest: Rest) => Promise<Result> {
    return (input, ...rest) => {
      inputs.set(name, [...(inputs.get(name) ?? []), input]);
      return fn(input, ...rest);
    };
  }
  return {
    ...actual,
    check: recording("check", actual.check),
    diff: recording("diff", actual.diff),
    reviewQueue: recording("reviewQueue", actual.reviewQueue),
    translate: recording("translate", actual.translate),
  };
});

function passedKeys(name: string): string[] {
  return (inputs.get(name) ?? []).flatMap((input) => Object.keys(input));
}

describe("the SDK result fields the output schemas leave undeclared are never requested", () => {
  it("passes none of the inputs that opt into them", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({ cwd: dir, createProvider: () => makeStubProvider() });

    await statusCheckTool.execute({}, context);
    await statusDiffTool.execute({}, context);
    await reviewQueueTool.execute({}, context);
    await translatePendingTool.execute({}, context);
    await estimateTool.execute({}, context);

    expect(passedKeys("check")).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(qa|requireReviewed|sensitive|consistency)$/),
      ]),
    );
    expect(passedKeys("diff")).not.toContain("unused");
    expect(passedKeys("reviewQueue")).not.toContain("includeApproved");
    expect(
      inputs.get("translate")?.map((input) => (input as { estimate?: boolean }).estimate),
    ).toEqual([undefined, true]);
    expect(inputs.get("check")).toHaveLength(1);
    expect(inputs.get("diff")).toHaveLength(1);
    expect(inputs.get("reviewQueue")).toHaveLength(1);
  });
});
