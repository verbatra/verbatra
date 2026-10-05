import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NOT_FOUND_ROUTE,
  SCRIPT_HASHES_FILE,
  type ScriptHashesByRoute,
} from "@/lib/inline-script-hashes.mjs";

let builtScriptHashes: ScriptHashesByRoute | undefined;

export function readScriptHashes(distDir: string): ScriptHashesByRoute {
  try {
    return JSON.parse(readFileSync(join(distDir, SCRIPT_HASHES_FILE), "utf8"));
  } catch {
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
