import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Loader } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";

const nativeRequire = createRequire(import.meta.url);

let generation = 0;

async function loadJsFresh(filepath: string): Promise<unknown> {
  delete nativeRequire.cache[nativeRequire.resolve(filepath)];
  generation += 1;
  const imported = (await import(
    `${pathToFileURL(filepath).href}?verbatra-generation=${generation}`
  )) as { readonly default?: unknown };
  return imported.default;
}

export function freshConfigLoaders(
  alias: Readonly<Record<string, string>>,
): Readonly<Record<string, Loader>> {
  return {
    ".ts": TypeScriptLoader({ alias, moduleCache: false }),
    ".js": loadJsFresh,
    ".cjs": loadJsFresh,
  };
}
