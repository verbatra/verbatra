import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CONTAINER_MARKERS, probeEnvironment } from "./environment.ts";

describe("probeEnvironment", () => {
  it("hands over the live process.env object, so the key bridge reaches this process", () => {
    expect(probeEnvironment(process, () => false).env).toBe(process.env);
  });

  it("needs a TTY on both stdin and stdout", () => {
    const env = {};
    const probe = (stdin?: boolean, stdout?: boolean) =>
      probeEnvironment(
        {
          env,
          stdin: stdin === undefined ? {} : { isTTY: stdin },
          stdout: stdout === undefined ? {} : { isTTY: stdout },
        },
        () => false,
      ).isTTY;
    expect(probe(true, true)).toBe(true);
    expect(probe(true, false)).toBe(false);
    expect(probe(false, true)).toBe(false);
    expect(probe(undefined, true)).toBe(false);
  });

  it.each(CONTAINER_MARKERS)("detects a container through %s", (marker) => {
    const exists = vi.fn((path: string) => path === marker);
    const probe = probeEnvironment({ env: {}, stdin: {}, stdout: {} }, exists);
    expect(probe.insideContainer).toBe(true);
  });

  it("probes both the Docker and the Podman marker on the real file system by default", () => {
    const exists = vi.fn((_path: string) => false);
    expect(probeEnvironment({ env: {}, stdin: {}, stdout: {} }, exists).insideContainer).toBe(
      false,
    );
    expect(exists.mock.calls.map(([path]) => path)).toEqual(["/.dockerenv", "/run/.containerenv"]);
    expect(probeEnvironment({ env: {}, stdin: {}, stdout: {} }).insideContainer).toBe(
      CONTAINER_MARKERS.some((marker) => existsSync(marker)),
    );
  });

  it("generate.ts wires the real process through probeEnvironment", () => {
    const source = readFileSync(new URL("./generate.ts", import.meta.url), "utf8");
    expect(source).toContain("...probeEnvironment(process),");
    expect(source).toContain("argv: process.argv.slice(2),");
  });
});
