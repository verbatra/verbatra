export type ScriptHashesByRoute = Readonly<Record<string, readonly string[]>>;

export declare const SCRIPT_HASHES_FILE: string;

export declare const NOT_FOUND_ROUTE: string;

export declare function scriptHash(source: string): string;

export declare function inlineScriptHashes(html: string): string[];

export declare function htmlRoute(relativePath: string): string;

export declare function collectScriptHashes(
  appDirectory: string,
): Promise<Record<string, string[]>>;
