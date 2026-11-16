import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { APP_ROOT, appCodeFiles, importSpecifiers } from "@/test-support/app-sources";

const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx"];
const SEGMENTER = /Intl\.Segmenter/;
const CLIENT_DIRECTIVE = /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/;

function sourceFiles(): string[] {
  return appCodeFiles().filter((file) => !/\.test\.tsx?$/.test(file));
}

function resolveSpecifier(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(APP_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  const found = EXTENSIONS.map((extension) => base + extension).find(
    (candidate) => existsSync(candidate) && /\.\w+$/.test(candidate),
  );
  return found;
}

function reachable(entry: string): Map<string, string> {
  const parents = new Map<string, string>([[entry, ""]]);
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"), { skipTypeOnly: true })) {
      const target = resolveSpecifier(file, specifier);
      if (target === undefined || parents.has(target)) continue;
      parents.set(target, file);
      queue.push(target);
    }
  }
  return parents;
}

function pathTo(parents: Map<string, string>, file: string): string {
  const chain: string[] = [];
  for (let at = file; at !== ""; at = parents.get(at) ?? "") chain.unshift(relative(APP_ROOT, at));
  return chain.join(" -> ");
}

const segmenterModules = sourceFiles().filter((file) => SEGMENTER.test(readFileSync(file, "utf8")));
const clientEntries = sourceFiles().filter((file) =>
  CLIENT_DIRECTIVE.test(readFileSync(file, "utf8")),
);

describe("Intl.Segmenter stays out of the client bundle", () => {
  it("finds the segmenter modules and the client components it guards", () => {
    const names = segmenterModules.map((file) => relative(APP_ROOT, file));
    expect(names).toContain("lib/word-count.ts");
    expect(names).toContain("lib/word-segments.tsx");
    expect(clientEntries.map((file) => relative(APP_ROOT, file))).toContain(
      "components/ai-setup-prompt.tsx",
    );
  });

  it("no use-client file reaches a module that uses Intl.Segmenter", () => {
    const offenders = clientEntries.flatMap((entry) => {
      const parents = reachable(entry);
      return segmenterModules
        .filter((file) => parents.has(file))
        .map((file) => pathTo(parents, file));
    });
    expect(offenders).toEqual([]);
  });

  it("importing a segmenter module constructs no segmenter", async () => {
    for (const file of segmenterModules) {
      vi.resetModules();
      const constructed = vi.spyOn(Intl, "Segmenter");
      try {
        await import(/* @vite-ignore */ file);
        expect(constructed, relative(APP_ROOT, file)).not.toHaveBeenCalled();
      } finally {
        constructed.mockRestore();
      }
    }
  });

  it("walks a planted chain", () => {
    const parents = reachable(join(APP_ROOT, "lib/word-segments.tsx"));
    expect(parents.has(join(APP_ROOT, "lib/word-count.ts"))).toBe(true);
  });
});
