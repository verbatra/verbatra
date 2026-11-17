import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT, importSpecifiers } from "@/test-support/app-sources";

const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs"];

function resolveSpecifier(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(APP_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return EXTENSIONS.map((extension) => base + extension).find(
    (candidate) => existsSync(candidate) && /\.\w+$/.test(candidate),
  );
}

function externalImports(entry: string): { files: string[]; packages: Map<string, string> } {
  const seen = new Set<string>([entry]);
  const packages = new Map<string, string>();
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"), { skipTypeOnly: true })) {
      const target = resolveSpecifier(file, specifier);
      if (target === undefined) {
        if (!specifier.startsWith(".")) packages.set(specifier, relative(APP_ROOT, file));
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return { files: [...seen].map((file) => relative(APP_ROOT, file)), packages };
}

describe("the proxy module graph stays free of zod", () => {
  const graph = externalImports(join(APP_ROOT, "proxy.ts"));

  it("walks the proxy imports", () => {
    expect(graph.files).toContain("lib/server-events.ts");
    expect(graph.files).toContain("lib/umami-event.ts");
    expect(graph.packages.has("fumadocs-core/i18n/middleware")).toBe(true);
  });

  it("reaches no module that imports zod", () => {
    expect(graph.packages.get("zod")).toBeUndefined();
  });

  it("finds zod in the relay schema module, which the proxy must not reach", () => {
    const relay = externalImports(join(APP_ROOT, "lib/relay-events.ts"));
    expect(relay.packages.has("zod")).toBe(true);
  });
});
