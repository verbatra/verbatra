import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const APP_SOURCE_DIRECTORIES = ["app", "components", "lib", "i18n"] as const;

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", ".source", "coverage"]);

function filesUnder(directory: string, keep: (name: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : filesUnder(path, keep);
    }
    return keep(entry.name) ? [path] : [];
  });
}

export function rootCodeFiles(): string[] {
  return readdirSync(APP_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && CODE_FILE.test(entry.name))
    .map((entry) => join(APP_ROOT, entry.name));
}

export function appCodeFiles(): string[] {
  return [
    ...rootCodeFiles(),
    ...APP_SOURCE_DIRECTORIES.flatMap((directory) =>
      filesUnder(join(APP_ROOT, directory), (name) => CODE_FILE.test(name)),
    ),
  ];
}

const BINARY_FILE = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

export function appTextFiles(): string[] {
  return [
    ...rootCodeFiles(),
    ...APP_SOURCE_DIRECTORIES.flatMap((directory) =>
      filesUnder(join(APP_ROOT, directory), (name) => !BINARY_FILE.test(name)),
    ),
  ];
}
