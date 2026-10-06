import type { ScriptHashesByRoute } from "./script-hashes-manifest.mjs";

export declare function scriptHash(source: string): string;

export declare function inlineScriptHashes(html: string): string[];

export declare function htmlRoute(relativePath: string): string;

export declare function collectScriptHashes(
  appDirectory: string,
): Promise<Record<string, string[]>>;

export declare function manifestProblems(routes: ScriptHashesByRoute): string[];
