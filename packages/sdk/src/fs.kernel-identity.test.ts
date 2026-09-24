import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readKernelIdentity } from "./fs.js";
import { makeTempDir } from "./test-support.js";

let procRoot: string;

beforeEach(async () => {
  procRoot = await makeTempDir();
});

afterEach(async () => {
  await rm(procRoot, { recursive: true, force: true });
});

async function plantBootId(content: string): Promise<void> {
  const dir = join(procRoot, "sys", "kernel", "random");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "boot_id"), content, "utf8");
}

async function plantPidNamespace(target: string): Promise<void> {
  const dir = join(procRoot, "self", "ns");
  await mkdir(dir, { recursive: true });
  await symlink(target, join(dir, "pid"));
}

describe("readKernelIdentity", () => {
  it("reads the boot ID and the PID namespace link target, trimmed", async () => {
    await plantBootId("0f6c2a4e-5b1d-4c3e-9a7f-2d8e6b1c4a90\n");
    await plantPidNamespace("pid:[4026531836]");

    expect(readKernelIdentity(procRoot)).toEqual({
      bootId: "0f6c2a4e-5b1d-4c3e-9a7f-2d8e6b1c4a90",
      pidNamespace: "pid:[4026531836]",
    });
  });

  it("reports nothing where the kernel exposes neither, as outside Linux", () => {
    expect(readKernelIdentity(join(procRoot, "absent"))).toEqual({});
  });

  it.each([
    ["empty", ""],
    ["implausibly long", "x".repeat(257)],
  ])("ignores a boot ID that is %s", async (_label, content) => {
    await plantBootId(content);
    await plantPidNamespace("pid:[4026531836]");

    expect(readKernelIdentity(procRoot)).toEqual({ pidNamespace: "pid:[4026531836]" });
  });
});
