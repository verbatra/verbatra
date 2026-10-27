import childProcess from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { describe, expect, it } from "vitest";
import { translateForWrite } from "./run.ts";
import { PLAYGROUND_LANGUAGES } from "./source.ts";
import { stubbedRequest } from "./test-support.ts";

type FsModule = Record<string, unknown>;

const KERNEL_IDENTITY_PROBES = [
  "node:fs.readFileSync(/proc/sys/kernel/random/boot_id)",
  "node:fs.readlinkSync(/proc/self/ns/pid)",
];

function sandboxDisk(): { touched: string[]; restore: () => void } {
  const touched: string[] = [];
  const originals: Array<[FsModule, string, unknown]> = [];
  for (const [label, module] of [
    ["node:fs", fs as unknown as FsModule],
    ["node:fs/promises", fsPromises as unknown as FsModule],
    ["node:child_process", childProcess as unknown as FsModule],
  ] as const) {
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== "function" || /^[A-Z]/.test(name)) {
        continue;
      }
      originals.push([module, name, value]);
      module[name] = (...args: unknown[]) => {
        touched.push(`${label}.${name}(${String(args[0])})`);
        throw new Error(
          `real disk and process access is forbidden in the playground run: ${label}.${name}`,
        );
      };
    }
  }
  syncBuiltinESMExports();
  return {
    touched,
    restore: () => {
      for (const [module, name, value] of originals) {
        module[name] = value;
      }
      syncBuiltinESMExports();
    },
  };
}

describe("translateForWrite: in-memory SDK run (D6)", () => {
  it("runs the real translate() with every file read and write going through the in-memory ports", async () => {
    const { provider, runRequest } = stubbedRequest();
    await import("@verbatra/sdk");
    const sandbox = sandboxDisk();
    let outcome: Awaited<ReturnType<typeof translateForWrite>>;
    try {
      outcome = await translateForWrite(runRequest);
    } finally {
      sandbox.restore();
    }
    expect(sandbox.touched).toEqual(KERNEL_IDENTITY_PROBES);
    expect(outcome.kind).toBe("ready");
    if (outcome.kind !== "ready") {
      return;
    }
    expect(Object.keys(outcome.output.translations)).toEqual([...PLAYGROUND_LANGUAGES]);
    expect(outcome.output.translations.de?.welcome).toBe("DE: Welcome back, {name}!");
    expect(provider.sent).toHaveLength(PLAYGROUND_LANGUAGES.length);
  });

  it("the sandbox itself catches a direct disk access", async () => {
    const sandbox = sandboxDisk();
    try {
      expect(() => fs.readFileSync("/etc/hosts")).toThrow(/forbidden/);
      await expect(async () => fsPromises.readFile("/etc/hosts")).rejects.toThrow(/forbidden/);
    } finally {
      sandbox.restore();
    }
    expect(sandbox.touched).toHaveLength(2);
  });

  it("the sandbox also catches a child process spawn", () => {
    const sandbox = sandboxDisk();
    try {
      expect(() => childProcess.execFileSync("git", ["--version"])).toThrow(/forbidden/);
    } finally {
      sandbox.restore();
    }
    expect(sandbox.touched).toEqual(["node:child_process.execFileSync(git)"]);
  });
});
