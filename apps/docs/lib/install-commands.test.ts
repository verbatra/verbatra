import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readIncludedSource } from "@/lib/docs-pages";
import { isNpmInstall, NPM_FENCE_LANG, NPM_INSTALL_COMMAND } from "@/lib/install-commands";

const DOCS_DIR = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_DIR = join(DOCS_DIR, "content/docs");

function docsFile(relative: string): string {
  return readFileSync(join(DOCS_DIR, relative), "utf8");
}

function mdxPages(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".mdx"),
  );
}

describe("the install command", () => {
  it("is the npm command the quickstart installs with, as a package-manager fence", () => {
    expect(docsFile("content/docs/(get-started)/quickstart/index.mdx")).toContain(
      `\`\`\`${NPM_FENCE_LANG}\n${NPM_INSTALL_COMMAND}\n\`\`\``,
    );
  });

  it("renders package-manager tabs only through remarkPackageManagerTabs, never the preset plugin", () => {
    const config = docsFile("source.config.ts");
    expect(config).toContain("remarkNpmOptions: false");
    expect(config).toContain("remarkPackageManagerTabs,");
  });

  it("tabs only install commands, so every other command stays one npx line", () => {
    const fences = mdxPages().flatMap((file) =>
      [...readIncludedSource(join(CONTENT_DIR, file)).matchAll(/^```npm\n([^\n]*)\n```/gm)].map(
        ([, command = ""]) => ({ file, command }),
      ),
    );
    expect(fences.length).toBeGreaterThan(0);
    expect(fences.filter(({ command }) => !isNpmInstall(command))).toEqual([]);
  });
});
