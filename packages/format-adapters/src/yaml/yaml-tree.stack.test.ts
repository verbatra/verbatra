import { describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";
import { AdapterError } from "../errors.js";
import { parseYamlObject } from "./yaml-tree.js";

vi.mock("yaml", async (importOriginal) => {
  const original = await importOriginal<typeof import("yaml")>();
  return { ...original, parseDocument: vi.fn(original.parseDocument) };
});

describe("parseYamlObject near stack exhaustion", () => {
  it("answers INVALID_YAML without a position when the parser throws a RangeError", () => {
    vi.mocked(yaml.parseDocument).mockImplementationOnce(() => {
      throw new RangeError("Maximum call stack size exceeded");
    });

    let thrown: unknown;
    try {
      parseYamlObject("a: 1\n");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AdapterError);
    expect(thrown).toMatchObject({ code: "INVALID_YAML", position: undefined });
  });

  it("still parses an ordinary document", () => {
    expect(parseYamlObject("a: 1\n").get("a")).toBe(1);
  });
});
