import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractionConfig } from "../config/extraction-config.js";
import type { ScanProgressEvent } from "../progress/types.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { diff } from "./diff.js";
import { doctor } from "./doctor.js";
import { extract } from "./extract.js";

const EXTRACT_CONFIG = { framework: "i18next", roots: ["src"] } satisfies ExtractionConfig;

async function project(): Promise<string> {
  const cwd = await makeTempDir();
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "locales"), { recursive: true });
  await writeFile(join(cwd, "src", "a.ts"), 't("nav.home", "Home");', "utf8");
  await writeFile(join(cwd, "src", "b.tsx"), "export const B = () => <p>Hello there</p>;", "utf8");
  await writeJsonFile(join(cwd, "locales", "en.json"), { nav: { home: "Home" }, old: "Old" });
  await writeJsonFile(join(cwd, "locales", "de.json"), { nav: { home: "Start" }, old: "Alt" });
  return cwd;
}

const expected: readonly ScanProgressEvent[] = [
  { type: "files-scanned", scanned: 1, total: 2 },
  { type: "files-scanned", scanned: 2, total: 2 },
];

describe("scan progress: onProgress reports every scanned source file", () => {
  it("extract reports each file it scans", async () => {
    const cwd = await project();
    const events: ScanProgressEvent[] = [];

    await extract({
      config: baseConfig({ extract: EXTRACT_CONFIG }),
      cwd,
      dryRun: true,
      onProgress: (event) => events.push(event),
    });

    expect(events).toEqual(expected);
  });

  it("diff reports the files of its unused-key scan, and none without --unused", async () => {
    const cwd = await project();
    const events: ScanProgressEvent[] = [];
    const config = baseConfig({ extract: EXTRACT_CONFIG });

    await diff({ config, cwd, onProgress: (event) => events.push(event) });
    expect(events).toEqual([]);

    await diff({ config, cwd, unused: true, onProgress: (event) => events.push(event) });
    expect(events).toEqual(expected);
  });

  it("doctor reports the files of its literal scan", async () => {
    const cwd = await project();
    await writeJsonFile(join(cwd, ".verbatrarc.json"), {
      ...baseConfig({ extract: EXTRACT_CONFIG }),
    });
    const events: ScanProgressEvent[] = [];

    await doctor({ cwd, literals: true, onProgress: (event) => events.push(event) });

    expect(events).toEqual(expected);
  });
});
