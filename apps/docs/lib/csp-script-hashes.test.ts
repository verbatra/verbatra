import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readScriptHashes, scriptHashesFor } from "./csp-script-hashes";
import { NOT_FOUND_ROUTE, SCRIPT_HASHES_FILE } from "./inline-script-hashes.mjs";

const ROUTES = {
  "/en/docs/quickstart": ["'sha256-page'"],
  [NOT_FOUND_ROUTE]: ["'sha256-not-found'"],
};

describe("scriptHashesFor", () => {
  it("returns the hashes of the prerendered page served at the pathname", () => {
    expect(scriptHashesFor("/en/docs/quickstart", ROUTES)).toEqual(["'sha256-page'"]);
  });

  it("falls back to the prerendered not-found page for any other pathname", () => {
    expect(scriptHashesFor("/en/docs/missing", ROUTES)).toEqual(["'sha256-not-found'"]);
  });

  it("allows no inline script at all when nothing was hashed", () => {
    expect(scriptHashesFor("/en", {})).toEqual([]);
  });
});

describe("readScriptHashes", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  it("reads the manifest the build wrote", async () => {
    directory = await mkdtemp(join(tmpdir(), "csp-manifest-"));
    await writeFile(join(directory, SCRIPT_HASHES_FILE), JSON.stringify(ROUTES));
    expect(readScriptHashes(directory)).toEqual(ROUTES);
  });

  it("reads an absent manifest as no hashes, which blocks every inline script", () => {
    expect(readScriptHashes(join(tmpdir(), "csp-manifest-absent"))).toEqual({});
  });
});
