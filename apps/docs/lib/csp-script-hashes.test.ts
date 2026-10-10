import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readScriptHashes, scriptHashesFor } from "./csp-script-hashes";
import { NOT_FOUND_ROUTE, SCRIPT_HASHES_FILE } from "./script-hashes-manifest.mjs";

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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it("logs one error naming the file and the consequence when production has no manifest", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const absent = join(tmpdir(), "csp-manifest-absent");

    expect(readScriptHashes(absent)).toEqual({});
    expect(error).toHaveBeenCalledTimes(1);
    const [message] = error.mock.calls[0] ?? [];
    expect(message).toContain(join(absent, SCRIPT_HASHES_FILE));
    expect(message).toContain("ENOENT");
    expect(message).toMatch(/allows no inline script.*do not hydrate.*analytics does not run/);
  });

  it("logs an unparsable manifest in production as well", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    directory = await mkdtemp(join(tmpdir(), "csp-manifest-"));
    await writeFile(join(directory, SCRIPT_HASHES_FILE), "{not json");

    expect(readScriptHashes(directory)).toEqual({});
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain(join(directory, SCRIPT_HASHES_FILE));
  });

  it("reads and reports the built manifest once per server, not once per request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    directory = await mkdtemp(join(tmpdir(), "csp-server-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.resetModules();
    const fresh = await import("./csp-script-hashes");

    expect(fresh.scriptHashesFor("/en")).toEqual([]);
    expect(fresh.scriptHashesFor("/de")).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain(join(directory, ".next", SCRIPT_HASHES_FILE));
  });

  it("stays quiet outside production, where no build has to exist", () => {
    vi.stubEnv("NODE_ENV", "test");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readScriptHashes(join(tmpdir(), "csp-manifest-absent"));
    expect(error).not.toHaveBeenCalled();
  });
});
