import { describe, expect, it } from "vitest";
import { buildToolRegistry } from "./registry.js";

const EXPECTED_READ_ONLY_ORDER = [
  "project.snapshot",
  "project.doctor",
  "status.check",
  "status.diff",
  "glossary.get",
  "glossary.write",
  "lock.state",
  "key.integrity",
  "key.value",
  "translation.editEntry",
  "translation.estimate",
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

  it("includes all 15 tools, with the two spend tools present, when spending is allowed", () => {
    const tools = buildToolRegistry(true);
    const names = tools.map((tool) => tool.name);

    expect(names).toHaveLength(15);
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

  it("gives every tool an outputSchema with type object at its root", () => {
    for (const tool of buildToolRegistry(true)) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.outputSchema.type, tool.name).toBe("object");
    }
  });

  it("lets every outputSchema tolerate unknown properties while every inputSchema rejects them", () => {
    for (const tool of buildToolRegistry(true)) {
      expect(JSON.stringify(tool.outputSchema), tool.name).not.toContain(
        '"additionalProperties":false',
      );
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it("marks exactly the tools that overwrite existing values as destructive", () => {
    const destructive = buildToolRegistry(true)
      .filter((tool) => tool.annotations.destructiveHint)
      .map((tool) => tool.name);

    expect(destructive).toEqual([
      "glossary.write",
      "translation.editEntry",
      "translation.retranslateEntry",
      "translation.translatePending",
    ]);
  });

  it("marks every tool that writes nothing as read-only and every other tool as not", () => {
    const writers = new Set([
      "glossary.write",
      "translation.editEntry",
      "translation.retranslateEntry",
      "translation.translatePending",
    ]);
    for (const tool of buildToolRegistry(true)) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(!writers.has(tool.name));
    }
  });

  it("says in every description what the tool costs or that it calls no provider", () => {
    for (const tool of buildToolRegistry(true)) {
      const spends = SPEND_TOOL_NAMES.includes(tool.name);
      const pattern = spends
        ? /bills your API usage/
        : /calls no provider|never calls a provider|does not call a provider/;
      expect(tool.description, tool.name).toMatch(pattern);
    }
  });

  it("marks only the two provider-calling tools as openWorldHint: true", () => {
    for (const tool of buildToolRegistry(true)) {
      const expected = SPEND_TOOL_NAMES.includes(tool.name);
      expect(tool.annotations.openWorldHint).toBe(expected);
    }
  });
});
