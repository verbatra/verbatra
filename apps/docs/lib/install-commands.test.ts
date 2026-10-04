import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

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
  it("is the npm command the quickstart installs with", () => {
    expect(docsFile("content/docs/(get-started)/quickstart.mdx")).toContain(
      `\`\`\`bash\n${NPM_INSTALL_COMMAND}\n\`\`\``,
    );
  });

  it("renders as one command, with no package-manager tabs on any page", () => {
    expect(docsFile("source.config.ts")).toContain("remarkNpmOptions: false");
    const tabbed = mdxPages().filter((file) =>
      /^```npm\s*$/m.test(readFileSync(join(CONTENT_DIR, file), "utf8")),
    );
    expect(tabbed).toEqual([]);
  });
});
