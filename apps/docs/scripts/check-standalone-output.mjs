import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  removeStandaloneEnvFiles,
  standaloneBuildOnlyFiles,
  tracedBuildOnlyFiles,
} from "../lib/standalone-output.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE_APP_PATH = "apps/docs";

const removed = await removeStandaloneEnvFiles(appRoot);
for (const file of removed)
  console.log(`check-standalone-output: removed ${file} from the standalone output`);

const traced = await tracedBuildOnlyFiles(appRoot);
const copied = await standaloneBuildOnlyFiles(appRoot, STANDALONE_APP_PATH);
for (const file of traced) console.error(`check-standalone-output: a server trace lists ${file}`);
for (const file of copied)
  console.error(`check-standalone-output: the standalone output holds ${file}`);
if (traced.length > 0 || copied.length > 0) process.exit(1);

console.log(
  "check-standalone-output: no env file, script, coverage, e2e or test file in the server output",
);
