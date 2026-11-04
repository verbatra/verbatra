import { spawn } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const fixtureDir = resolve(here, "studio-fixture");
const cliEntry = resolve(repoRoot, "packages/cli/dist/index.js");
const outputDir = resolve(here, "../public/screenshots");

const BANNER = /Verbatra Studio running at (\S+)/;
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const BOOT_TIMEOUT_MS = 60_000;

const THEMES = ["dark", "light"];
const SHOTS = [
  { name: "studio-review", hash: "review", heading: "Review", ready: "Reasons", height: 600 },
  {
    name: "studio-translations",
    hash: "translations",
    heading: "Translations",
    ready: "Keys",
    listView: true,
    height: 1180,
  },
];

function findFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function seedFixture() {
  const runtimeDir = resolve(fixtureDir, ".verbatra-local");
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  await copyFile(
    resolve(fixtureDir, "run-status.seed.json"),
    resolve(runtimeDir, "run-status.json"),
  );
}

function startStudio(port) {
  const child = spawn(
    process.execPath,
    [cliEntry, "studio", "--cwd", fixtureDir, "--port", String(port)],
    {
      cwd: fixtureDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const entryUrl = new Promise((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => {
      rejectUrl(
        new Error(`Studio did not print its banner within ${BOOT_TIMEOUT_MS}ms.\n${stderr}`),
      );
    }, BOOT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = BANNER.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[1]);
      }
    });

    child.once("exit", (code) => {
      clearTimeout(timer);
      rejectUrl(new Error(`Studio exited with code ${code} before it was ready.\n${stderr}`));
    });
  });

  return { child, entryUrl };
}

async function capture(browser, entryUrl, theme) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await context.addInitScript((value) => {
    localStorage.setItem("verbatra-studio-theme", value);
  }, theme);

  const page = await context.newPage();
  await page.goto(entryUrl, { waitUntil: "networkidle" });
  await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);

  const written = [];
  for (const shot of SHOTS) {
    await page.setViewportSize({ width: VIEWPORT.width, height: shot.height });
    await page.evaluate((hash) => {
      window.location.hash = `#/${hash}`;
    }, shot.hash);
    await page.getByRole("heading", { level: 1, name: shot.heading, exact: true }).waitFor();
    await page.getByText(shot.ready, { exact: true }).first().waitFor();
    if (shot.listView) {
      await page.getByRole("button", { name: "List", exact: true }).click();
      await page.getByText("Pending changes", { exact: true }).first().waitFor();
    }
    await page.waitForTimeout(400);

    const png = await page.screenshot({ animations: "disabled" });
    const target = resolve(outputDir, `${shot.name}-${theme}.webp`);
    await sharp(png).webp({ quality: 82, effort: 6 }).toFile(target);
    written.push(target);
  }

  await context.close();
  return written;
}

async function main() {
  await seedFixture();
  await mkdir(outputDir, { recursive: true });

  const port = await findFreePort();
  const { child, entryUrl } = startStudio(port);
  let browser;

  try {
    const url = await entryUrl;
    browser = await chromium.launch();
    for (const theme of THEMES) {
      for (const file of await capture(browser, url, theme)) {
        process.stdout.write(`wrote ${file}\n`);
      }
    }
  } finally {
    await browser?.close();
    child.kill("SIGINT");
  }
}

await main();
