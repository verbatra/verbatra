import { createTsdownConfig } from "@verbatra/config/tsdown";

const WORKSPACE_INTERNAL_DIRS = ["core", "format-adapters", "ai-providers", "exchange", "extract"];

const WORKSPACE_INTERNALS = WORKSPACE_INTERNAL_DIRS.map((dir) => `@verbatra/${dir}`);

const WORKSPACE_DECLARATIONS = Object.fromEntries(
  WORKSPACE_INTERNAL_DIRS.map((dir) => [`@verbatra/${dir}`, [`../${dir}/dist/index.d.ts`]]),
);

export default createTsdownConfig({
  deps: { alwaysBundle: WORKSPACE_INTERNALS },
  dts: { compilerOptions: { paths: WORKSPACE_DECLARATIONS } },
});
