import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  makeConsumer,
  pollUntil,
  readSharedConsumer,
  runVerbatra,
  type Subprocess,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

const BANNER_URL_PATTERN = /Verbatra Studio running at (\S+)/;

async function scaffoldProject(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo" });
  await writeFileIn(
    dir,
    "verbatra.config.ts",
    `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },\n});\n`,
  );
}

describe("studio (no key)", () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await makeConsumer({ withStudio: true });
  }, 180_000);

  it("serves the dashboard from the installed package and stops cleanly on interrupt", async () => {
    const dir = join(consumer.dir, "studio-live");
    await scaffoldProject(dir);

    const studio: Subprocess = spawnVerbatra(consumer, ["studio", "--cwd", dir]);
    let stdout = "";
    studio.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    let stopResult: Awaited<Subprocess> | undefined;

    try {
      await pollUntil(() => BANNER_URL_PATTERN.test(stdout), {
        timeoutMs: 60_000,
        intervalMs: 250,
      });

      const url = BANNER_URL_PATTERN.exec(stdout)?.[1];
      expect(url).toBeDefined();
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/);

      const bootstrap = await fetch(url as string, { redirect: "manual" });
      expect(bootstrap.status).toBe(303);
      expect(bootstrap.headers.get("location")).toBe("/");

      const setCookie = bootstrap.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      const cookie = (setCookie as string).split(";")[0] as string;

      const rootUrl = new URL("/", url as string).toString();
      const document = await fetch(rootUrl, { headers: { cookie } });
      expect(document.status).toBe(200);
      expect(document.headers.get("content-type")).toContain("text/html");
      expect((await document.text()).toLowerCase()).toContain("<html");
    } finally {
      studio.kill("SIGINT");
      stopResult = await studio;
    }

    expect(stopResult.signal).toBeUndefined();
    expect(stopResult.exitCode).toBe(0);
  }, 120_000);

  it("exits 2 with a structured INVALID_PORT error before importing studio or loading config", async () => {
    const dir = join(consumer.dir, "studio-bad-port");
    await scaffoldProject(dir);

    const result = await runVerbatra(consumer, ["studio", "--port", "70000", "--cwd", dir], {
      timeoutMs: 60_000,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("INVALID_PORT");
    expect(result.stdout).not.toContain("Verbatra Studio running at");
  }, 120_000);
});

describe("studio (no key, @verbatra/studio not installed)", () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
  }, 180_000);

  it("prints the install hint and exits 2 instead of failing to resolve the import", async () => {
    const dir = join(consumer.dir, "studio-absent");
    await scaffoldProject(dir);

    const result = await runVerbatra(consumer, ["studio", "--cwd", dir], { timeoutMs: 60_000 });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("@verbatra/studio");
    expect(result.stderr).toContain("pnpm add -D @verbatra/studio");
    expect(result.stdout).not.toContain("Verbatra Studio running at");
  }, 120_000);
});
