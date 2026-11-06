import { basename, dirname, extname, join } from "node:path";
import type { FormatId } from "@verbatra/core";

export function siblingPaths(format: FormatId, absolutePath: string): string[] {
  return format === "apple-strings"
    ? [join(dirname(absolutePath), `${basename(absolutePath, extname(absolutePath))}.stringsdict`)]
    : [];
}
