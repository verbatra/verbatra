import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NOT_FOUND_ROUTE,
  SCRIPT_HASHES_FILE,
  type ScriptHashesByRoute,
} from "@/lib/inline-script-hashes.mjs";

let builtScriptHashes: ScriptHashesByRoute | undefined;

function reportUnreadableManifest(file: string, error: unknown): void {
  if (process.env.NODE_ENV !== "production") return;
  const reason = error instanceof Error ? error.message : String(error);
  console.error(
    `csp: cannot read the inline script hashes at ${file} (${reason}); every page is served with a ` +
      "Content-Security-Policy that allows no inline script, so pages render but do not hydrate " +
      "and analytics does not run. Rebuild with pnpm build, which writes the file.",
  );
}

export function readScriptHashes(distDir: string): ScriptHashesByRoute {
  const file = join(distDir, SCRIPT_HASHES_FILE);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    reportUnreadableManifest(file, error);
    return {};
  }
}

function loadBuiltScriptHashes(): ScriptHashesByRoute {
  builtScriptHashes ??= readScriptHashes(join(process.cwd(), ".next"));
  return builtScriptHashes;
}

export function scriptHashesFor(
  pathname: string,
  routes: ScriptHashesByRoute = loadBuiltScriptHashes(),
): readonly string[] {
  return routes[pathname] ?? routes[NOT_FOUND_ROUTE] ?? [];
}
