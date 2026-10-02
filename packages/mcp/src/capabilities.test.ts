import { describe, expect, it } from "vitest";
import { MCP_CAPABILITIES } from "./capabilities.js";

describe("MCP_CAPABILITIES", () => {
  it("announces value redaction, which the CLI checks before passing redactValues", () => {
    expect(MCP_CAPABILITIES).toEqual({ valuesRedaction: true });
  });
});
