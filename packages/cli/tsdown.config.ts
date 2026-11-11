import { createTsdownConfig } from "@verbatra/config/tsdown";

const LOCAL_IMPORT = 'import { defineConfig } from "@verbatra/sdk";';
const DIRECT_REEXPORT = 'export { defineConfig } from "@verbatra/sdk";';
const EXPORT_LIST = /^export \{ ([^}]*) \};$/m;

function reexportSdkDirectly(code: string): string {
  if (!code.includes(LOCAL_IMPORT) || !EXPORT_LIST.test(code)) {
    throw new Error(
      "lib.js no longer imports defineConfig from @verbatra/sdk in the expected form",
    );
  }
  const withoutLocalExport = code.replace(EXPORT_LIST, (_whole, names: string) => {
    const kept = names.split(", ").filter((name) => name !== "defineConfig");
    return `export { ${kept.join(", ")} };`;
  });
  return withoutLocalExport.replace(LOCAL_IMPORT, DIRECT_REEXPORT);
}

const keepSdkReexportDirect = {
  name: "keep-sdk-reexport-direct",
  renderChunk(code: string, chunk: { fileName: string }) {
    return chunk.fileName === "lib.js" ? { code: reexportSdkDirectly(code), map: null } : null;
  },
};

export default [
  createTsdownConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
    deps: { neverBundle: ["@verbatra/studio", "@verbatra/mcp"] },
  }),
  createTsdownConfig({
    entry: ["src/lib.ts"],
    format: ["esm", "cjs"],
    clean: false,
    plugins: [keepSdkReexportDirect],
  }),
  createTsdownConfig({
    entry: { "json-envelope-schema": "src/json-envelope-schema.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: true,
    outDir: "node_modules/.cache/verbatra-cli-schemas",
  }),
];
