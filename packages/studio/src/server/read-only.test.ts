import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  withServer,
} from "./test-support.js";

const SRC_ROOT = fileURLToPath(new URL("../", import.meta.url));

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") {
      continue;
    }
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("static proof: no write-capable sdk call is ever referenced", () => {
  it("never calls watch(, importWorkbook(, or exportWorkbook( anywhere in studio's own source, and calls translate( only from the one handler that is meant to or from the estimate handler as a dry run", () => {
    const forbidden = ["watch", "importWorkbook", "exportWorkbook", "translate"].map((name) => ({
      name,
      pattern: new RegExp(`(?<![.\\w])${name}\\(`),
    }));
    const allowedTranslateCaller = join(SRC_ROOT, "server", "methods", "translate-pending.ts");
    const dryRunTranslateCaller = join(SRC_ROOT, "server", "methods", "estimate.ts");
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      if (file === allowedTranslateCaller) {
        continue;
      }
      if (file === dryRunTranslateCaller) {
        const content = readFileSync(file, "utf8");
        expect(content).toMatch(/estimate: true/);
        expect(content).not.toMatch(/createProvider|dryRun: false/);
        continue;
      }
      const content = readFileSync(file, "utf8");
      for (const { pattern } of forbidden) {
        if (pattern.test(content)) {
          offenders.push(`${relative(SRC_ROOT, file)}: ${pattern.source}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

async function hashTree(root: string): Promise<string> {
  const entries: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const content = await readFile(full);
      entries.push(`${relative(root, full)}:${content.toString("hex")}`);
    }
  }

  await walk(root);
  entries.sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

describe("read-only proof: the fixture project's file tree is untouched", () => {
  it("hashes identically after driving the read views, and a default server answers METHOD_UNKNOWN for both spend methods", async () => {
    const project = await makeFixtureProject();
    try {
      const before = await hashTree(project.root);

      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, "read-only-proof-token");
          const postMethod = async (
            method: string,
            params: Record<string, unknown> = {},
          ): Promise<{ error?: { code?: string } }> => {
            const response = await fetch(new URL("/rpc", server.url), {
              method: "POST",
              headers: {
                Cookie: cookie,
                "Content-Type": "application/json",
                Origin: server.url.replace(/\/$/, ""),
              },
              body: JSON.stringify({ method, params }),
            });
            return (await response.json()) as { error?: { code?: string } };
          };
          const readMethods = [
            "project.snapshot",
            "status.check",
            "status.diff",
            "glossary.get",
            "lock.state",
            "history.list",
          ];
          for (const method of readMethods) {
            await postMethod(method);
          }
          const retranslate = await postMethod("translation.retranslateEntry", {
            locale: "de",
            key: "greeting",
          });
          expect(retranslate.error?.code).toBe("METHOD_UNKNOWN");
          const translatePending = await postMethod("translation.translatePending");
          expect(translatePending.error?.code).toBe("METHOD_UNKNOWN");
        },
        {
          token: "read-only-proof-token",
          loader: fixtureLoader(project),
        },
      );

      const after = await hashTree(project.root);
      expect(after).toBe(before);
    } finally {
      await project.cleanup();
    }
  });
});

describe("static proof: the retranslateEntry handler never reads a provider's environment directly", () => {
  it("never references process.env, the PROVIDER_ENV table, or a raw provider construction call", () => {
    const path = join(SRC_ROOT, "server", "methods", "retranslate-entry.ts");
    const content = readFileSync(path, "utf8");

    expect(content).not.toContain("process.env");
    expect(content).not.toContain("PROVIDER_ENV");
    expect(content).not.toMatch(/(?<![.\w])buildProvider\(/);
    expect(content).not.toMatch(/(?<![.\w])selectProvider\(/);
  });
});

describe("static proof: the translatePending handler never reads a provider's environment directly", () => {
  it("never references process.env, the PROVIDER_ENV table, or a raw provider construction call", () => {
    const path = join(SRC_ROOT, "server", "methods", "translate-pending.ts");
    const content = readFileSync(path, "utf8");

    expect(content).not.toContain("process.env");
    expect(content).not.toContain("PROVIDER_ENV");
    expect(content).not.toMatch(/(?<![.\w])buildProvider\(/);
    expect(content).not.toMatch(/(?<![.\w])selectProvider\(/);
  });
});
