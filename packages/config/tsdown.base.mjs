const DEFAULT_DTS = { sourcemap: false };

/**
 * @param {import("tsdown").UserConfig["dts"]} dts
 */
function resolveDts(dts) {
  if (dts === undefined) {
    return DEFAULT_DTS;
  }
  return typeof dts === "object" ? { ...DEFAULT_DTS, ...dts } : dts;
}

/**
 * @param {import("tsdown").UserConfig} [overrides]
 * @returns {import("./tsdown.base.d.mts").TsdownConfig}
 */
export function createTsdownConfig(overrides = {}) {
  return {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    sourcemap: true,
    clean: true,
    treeshake: true,
    fixedExtension: false,
    hash: false,
    outputOptions: { comments: { jsdoc: false } },
    ...overrides,
    dts: resolveDts(overrides.dts),
  };
}
