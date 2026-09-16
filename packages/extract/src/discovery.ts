import { join } from "node:path";
import type { DirectoryEntry, SourceFs } from "./source-fs-port.js";

export const DEFAULT_EXCLUDED_DIRECTORIES = [
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".verbatra",
  "dist",
  "build",
  "coverage",
] as const;

export const TEMPLATE_FILE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".html",
  ".htm",
  ".astro",
  ".hbs",
  ".handlebars",
  ".ejs",
  ".pug",
  ".njk",
  ".liquid",
  ".mdx",
] as const;

export interface SourceDiscoveryInput {
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly exclude?: readonly string[];
  readonly onUnreadableDirectory?: (path: string) => void;
  readonly templateExtensions?: readonly string[];
  readonly onTemplateFile?: (path: string) => void;
}

export function hasExtension(name: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => name.endsWith(extension));
}

function excludedNames(input: SourceDiscoveryInput): ReadonlySet<string> {
  return new Set([...DEFAULT_EXCLUDED_DIRECTORIES, ...(input.exclude ?? [])]);
}

async function readDirectory(
  path: string,
  fs: SourceFs,
  input: SourceDiscoveryInput,
): Promise<readonly DirectoryEntry[]> {
  try {
    return await fs.listDirectory(path);
  } catch {
    input.onUnreadableDirectory?.(path);
    return [];
  }
}

async function walk(
  path: string,
  fs: SourceFs,
  input: SourceDiscoveryInput,
  excluded: ReadonlySet<string>,
  found: Set<string>,
): Promise<void> {
  for (const entry of await readDirectory(path, fs, input)) {
    const child = join(path, entry.name);
    if (entry.kind === "file" && hasExtension(entry.name, input.extensions)) {
      found.add(child);
    } else if (entry.kind === "file" && hasExtension(entry.name, input.templateExtensions ?? [])) {
      input.onTemplateFile?.(child);
    }
    if (entry.kind === "directory" && !excluded.has(entry.name)) {
      await walk(child, fs, input, excluded, found);
    }
  }
}

export async function discoverSourceFiles(
  input: SourceDiscoveryInput,
  fs: SourceFs,
): Promise<readonly string[]> {
  const excluded = excludedNames(input);
  const found = new Set<string>();
  for (const root of new Set(input.roots)) {
    await walk(root, fs, input, excluded, found);
  }
  return [...found].sort();
}
