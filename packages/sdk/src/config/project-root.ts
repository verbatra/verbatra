import type { VerbatraConfig } from "./schema.js";

const loadedRoots = new WeakMap<VerbatraConfig, string>();

export function rememberProjectRoot(config: VerbatraConfig, root: string): void {
  loadedRoots.set(config, root);
}

export function projectCwd(input: {
  readonly cwd?: string | undefined;
  readonly config: VerbatraConfig;
}): string {
  return input.cwd ?? loadedRoots.get(input.config) ?? process.cwd();
}
