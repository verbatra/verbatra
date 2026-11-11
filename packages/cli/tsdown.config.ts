import { createTsdownConfig } from "@verbatra/config/tsdown";

const SDK_REEXPORT_IMPORT = 'import { defineConfig } from "@verbatra/sdk";';

const SDK_REEXPORT = 'export { defineConfig } from "@verbatra/sdk";';

const keepSdkReexportDirect = {
  name: "keep-sdk-reexport-direct",
  renderChunk(code: string, chunk: { fileName: string }) {
    if (!chunk.fileName.endsWith(".js") || !code.startsWith(SDK_REEXPORT_IMPORT)) {
      return null;
    }
    const withoutLocalExport = code.replace(/^export \{ ([^}]*) \};$/m, (_whole, names: string) => {
      const kept = names.split(", ").filter((name) => name !== "defineConfig");
      return `export { ${kept.join(", ")} };`;
    });
    return { code: withoutLocalExport.replace(SDK_REEXPORT_IMPORT, SDK_REEXPORT), map: null };
  },
};

export default [
  createTsdownConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: ["dist/**", "!dist/lib.*"],
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
