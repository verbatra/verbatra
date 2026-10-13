import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorOf,
  buildThirdPartyLicenses,
  listDeployedPlatformPackages,
  PLATFORM_LICENSES_FILE,
  renderThirdPartyNotices,
} from "../lib/third-party-licenses.ts";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const platformFile = resolve(appDir, PLATFORM_LICENSES_FILE);
const jsonFile = resolve(appDir, "lib/licenses.generated.json");
const noticesFile = resolve(repoRoot, "THIRD_PARTY_NOTICES.md");

function readKnown() {
  return existsSync(platformFile) ? JSON.parse(readFileSync(platformFile, "utf8")) : {};
}

function fetchPlatformLicense(key) {
  const raw = execFileSync("npm", ["view", key, "license", "author", "--json"], {
    cwd: appDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const view = JSON.parse(raw);
  const manifest = typeof view === "string" ? { license: view } : view;
  if (typeof manifest.license !== "string") throw new Error(`npm has no license for ${key}`);
  return { license: manifest.license, author: authorOf(manifest) };
}

const known = readKnown();
const platform = {};
for (const key of listDeployedPlatformPackages(appDir)) {
  platform[key] = known[key] ?? fetchPlatformLicense(key);
}
writeFileSync(platformFile, `${JSON.stringify(platform, null, 2)}\n`);

const data = buildThirdPartyLicenses(appDir);
writeFileSync(jsonFile, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync(noticesFile, renderThirdPartyNotices(data));
execFileSync("pnpm", ["exec", "biome", "format", "--write", jsonFile, platformFile], {
  cwd: repoRoot,
  stdio: ["ignore", "ignore", "inherit"],
});

console.log(
  `sync-licenses: ${data.packageCount} packages in ${data.groups.length} license groups, ${data.texts.length} distinct license texts, ${Object.keys(platform).length} packages for the linux-x64 glibc image.`,
);
