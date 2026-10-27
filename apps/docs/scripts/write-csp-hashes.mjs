import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectScriptHashes, manifestProblems } from "../lib/inline-script-hashes.mjs";
import { SCRIPT_HASHES_FILE } from "../lib/script-hashes-manifest.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(appRoot, ".next");
const standaloneDistDir = resolve(distDir, "standalone/apps/docs/.next");

const routes = await collectScriptHashes(resolve(distDir, "server/app"));
const routeCount = Object.keys(routes).length;

const problems = manifestProblems(routes);
if (problems.length > 0) {
  for (const problem of problems) console.error(`write-csp-hashes: ${problem} in ${distDir}`);
  process.exit(1);
}

const manifest = `${JSON.stringify(routes)}\n`;
const targets = [distDir, ...(existsSync(standaloneDistDir) ? [standaloneDistDir] : [])];
for (const target of targets) {
  await writeFile(resolve(target, SCRIPT_HASHES_FILE), manifest);
}

console.log(
  `write-csp-hashes: hashed the inline scripts of ${routeCount} prerendered pages into ${targets
    .map((target) => resolve(target, SCRIPT_HASHES_FILE))
    .join(", ")}`,
);
