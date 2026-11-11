import { describe, expect, it } from "vitest";
import { createTsdownConfig } from "./tsdown.base.mjs";

describe("createTsdownConfig", () => {
  it("applies the baked defaults when called with no overrides", () => {
    const config = createTsdownConfig();

    expect(config).toEqual({
      entry: ["src/index.ts"],
      format: ["esm", "cjs"],
      dts: { sourcemap: false },
      sourcemap: true,
      clean: true,
      treeshake: true,
      fixedExtension: false,
      hash: false,
    });
  });

  it("lets an override win over the matching default", () => {
    const config = createTsdownConfig({ format: ["esm"], dts: false });

    expect(config.format).toEqual(["esm"]);
    expect(config.dts).toBe(false);
  });

  it("keeps the untouched defaults when only some keys are overridden", () => {
    const config = createTsdownConfig({ format: ["esm"] });

    expect(config.entry).toEqual(["src/index.ts"]);
    expect(config.sourcemap).toBe(true);
    expect(config.clean).toBe(true);
    expect(config.treeshake).toBe(true);
  });

  it("passes through an override key that has no baked default", () => {
    const config = createTsdownConfig({ minify: true });

    expect(config.minify).toBe(true);
  });
});
