/**
 * @param {import("tsdown").UserConfig} [overrides]
 * @returns {import("./tsdown.base.d.mts").TsdownConfig}
 */
export function createTsdownConfig(overrides = {}) {
  return {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: { sourcemap: false },
    sourcemap: true,
    clean: true,
    treeshake: true,
    fixedExtension: false,
    hash: false,
    ...overrides,
  };
}
