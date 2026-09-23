import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeIssuePath } from "./issue-path.js";

function firstIssue(schema: z.ZodType, value: unknown): z.core.$ZodIssue {
  const parsed = schema.safeParse(value);
  if (parsed.success || parsed.error.issues[0] === undefined) {
    throw new Error("expected a failed parse");
  }
  return parsed.error.issues[0];
}

describe("describeIssuePath", () => {
  it("names the root for an issue at the top level", () => {
    const schema = z.object({ a: z.string() });

    expect(describeIssuePath(schema, firstIssue(schema, 1))).toBe("(root)");
  });

  it("joins object keys and array indexes through optional, nullable, and readonly wrappers", () => {
    const schema = z.object({
      list: z
        .array(z.object({ inner: z.object({ n: z.number() }).nullable() }))
        .readonly()
        .optional(),
    });

    expect(describeIssuePath(schema, firstIssue(schema, { list: [{ inner: { n: "x" } }] }))).toBe(
      "list.0.inner.n",
    );
  });

  it("replaces a record key and everything after it with a placeholder", () => {
    const schema = z.object({ byKey: z.record(z.string(), z.object({ n: z.number() })) });

    expect(
      describeIssuePath(schema, firstIssue(schema, { byKey: { "user.key": { n: "x" } } })),
    ).toBe("byKey.<key>");
  });

  it("keeps the remaining path as given once it passes a schema it cannot walk into", () => {
    const schema = z.object({
      pick: z.union([z.object({ a: z.number() }), z.object({ a: z.number(), b: z.string() })]),
    });
    const issue: z.core.$ZodIssue = {
      code: "invalid_type",
      expected: "number",
      path: ["pick", "a"],
      message: "bad",
      input: "x",
    };

    expect(describeIssuePath(schema, issue)).toBe("pick.a");
  });
});
