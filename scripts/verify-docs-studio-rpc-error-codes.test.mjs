import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC_GATE = resolve(REPO_ROOT, "packages/studio/src/server/rpc-gate.ts");
const CLIENT_API = resolve(REPO_ROOT, "packages/studio/src/app/api.ts");
const PAGE = "apps/docs/content/docs/(agents)/agent-tools-in-studio";
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];
const TABLE_ROWS = /^\| --- \| --- \|\n((?:\| `[A-Z_]+` \|[^\n]*\n)+)/gm;
const CLIENT_SYNTHESIZED = ["SESSION_EXPIRED"];

function gateCodes() {
  const source = readFileSync(RPC_GATE, "utf8");
  return [...new Set([...source.matchAll(/"([A-Z]+(?:_[A-Z]+)+|INTERNAL)"/g)].map((m) => m[1]))];
}

function pageText(suffix) {
  return readFileSync(resolve(REPO_ROOT, `${PAGE}${suffix}.mdx`), "utf8");
}

function tableCodes(text) {
  const rows = [...text.matchAll(TABLE_ROWS)]
    .map((m) => m[1])
    .find((block) => block.includes("`REQUEST_INVALID`"));
  if (rows === undefined) throw new Error("the RPC error code table could not be located");
  return [...rows.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((m) => m[1]);
}

describe("the Studio RPC error code table", () => {
  const codes = gateCodes();

  it("reads the codes rpc-gate.ts can return", () => {
    expect(codes).toContain("BATCH_TOO_LARGE");
    expect(codes).toContain("METHOD_RATE_LIMITED");
    expect(codes.length).toBeGreaterThanOrEqual(8);
  });

  it("names a client-synthesized code only where the app produces it", () => {
    const api = readFileSync(CLIENT_API, "utf8");
    for (const code of CLIENT_SYNTHESIZED) expect(api).toContain(`"${code}"`);
  });

  describe.each(LOCALE_SUFFIXES)("page%s", (suffix) => {
    const text = pageText(suffix);

    it("documents every code the gate returns", () => {
      for (const code of codes) expect(text, code).toContain(`\`${code}\``);
    });

    it("tabulates only codes the gate or the client produces", () => {
      for (const code of tableCodes(text)) {
        expect([...codes, ...CLIENT_SYNTHESIZED], code).toContain(code);
      }
    });

    it("lists each tabulated code once", () => {
      const listed = tableCodes(text);
      expect(new Set(listed).size).toBe(listed.length);
    });
  });
});
