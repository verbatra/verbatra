import { describe, expect, it } from "vitest";
import { buildToolRegistry } from "./registry.js";

const EXPECTED_READ_ONLY_ORDER = [
  "project.snapshot",
  "status.check",
  "status.diff",
  "glossary.get",
  "glossary.write",
  "lock.state",
  "key.integrity",
  "key.value",
  "translation.editEntry",
  "review.queue",
  "usage.summary",
];

const SPEND_TOOL_NAMES = ["translation.retranslateEntry", "translation.translatePending"];

describe("buildToolRegistry", () => {
  it("omits the two spend tools when spending is not allowed", () => {
    const tools = buildToolRegistry(false);
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(EXPECTED_READ_ONLY_ORDER);
    for (const spendTool of SPEND_TOOL_NAMES) {
      expect(names).not.toContain(spendTool);
    }
  });

  it("includes all 13 tools, with the two spend tools present, when spending is allowed", () => {
    const tools = buildToolRegistry(true);
    const names = tools.map((tool) => tool.name);

    expect(names).toHaveLength(13);
    for (const spendTool of SPEND_TOOL_NAMES) {
      expect(names).toContain(spendTool);
    }
  });

  it("returns tools in the same deterministic order across repeated calls", () => {
    const first = buildToolRegistry(true).map((tool) => tool.name);
    const second = buildToolRegistry(true).map((tool) => tool.name);

    expect(first).toEqual(second);
  });

  it("gives every tool a name, a description, an inputSchema, and complete annotations", () => {
    for (const tool of buildToolRegistry(true)) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it("gives every declared outputSchema type object at its root", () => {
    for (const tool of buildToolRegistry(true)) {
      if (tool.outputSchema !== undefined) {
        expect(tool.outputSchema.type).toBe("object");
      }
    }
  });

  it("marks only the two provider-calling tools as openWorldHint: true", () => {
    for (const tool of buildToolRegistry(true)) {
      const expected = SPEND_TOOL_NAMES.includes(tool.name);
      expect(tool.annotations.openWorldHint).toBe(expected);
    }
  });
});
