import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { checkFile } from "./check-file.js";

const KEYS = 400;
const MANY_LOCALES = 24;
const WARMUP_RUNS = 5;
const RUNS = 10;

function catalogue(prefix: string): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: KEYS }, (_, index) => [
      `key${index}`,
      `${prefix} {{name}} <b>${index}</b>`,
    ]),
  );
}

async function projectWith(targetLocales: readonly string[]): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), catalogue("Hello"));
  for (const locale of targetLocales) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), catalogue(`Hallo ${locale}`));
  }
  return dir;
}

async function fastestCpuMs(work: () => Promise<unknown>): Promise<number> {
  for (let run = 0; run < WARMUP_RUNS; run += 1) {
    await work();
  }
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < RUNS; run += 1) {
    const started = process.cpuUsage();
    await work();
    const used = process.cpuUsage(started);
    fastest = Math.min(fastest, (used.user + used.system) / 1_000);
  }
  return fastest;
}

describe("checkFile cost is bound by the one file, not the project", () => {
  it("costs about the same with one target locale as with many, unlike the project-wide check", async () => {
    const many = Array.from({ length: MANY_LOCALES }, (_, index) => `x${index}`);
    const smallDir = await projectWith(["x0"]);
    const largeDir = await projectWith(many);
    const small = baseConfig({ targetLocales: ["x0"] });
    const large = baseConfig({ targetLocales: many });

    const fileSmall = await fastestCpuMs(() =>
      checkFile({ config: small, cwd: smallDir, file: "locales/x0.json" }),
    );
    const fileLarge = await fastestCpuMs(() =>
      checkFile({ config: large, cwd: largeDir, file: "locales/x0.json" }),
    );
    const projectLarge = await fastestCpuMs(() =>
      check({ config: large, cwd: largeDir, qa: true, qaSeverity: "error" }),
    );

    expect(fileLarge / fileSmall).toBeLessThan(3);
    expect(projectLarge / fileLarge).toBeGreaterThan(2);
  });
});
