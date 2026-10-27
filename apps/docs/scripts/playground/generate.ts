import { fileURLToPath } from "node:url";
import sdkPackage from "@verbatra/sdk/package.json" with { type: "json" };
import { main } from "./cli.ts";
import { probeEnvironment } from "./environment.ts";
import { readExistingOutput, writeAtomically } from "./output.ts";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE } from "./source.ts";

const outputPath = fileURLToPath(
  new URL("../../lib/playground/translations.json", import.meta.url),
);

process.exitCode = await main({
  argv: process.argv.slice(2),
  ...probeEnvironment(process),
  items: PLAYGROUND_SOURCE,
  languages: PLAYGROUND_LANGUAGES,
  sdkVersion: sdkPackage.version,
  outputLabel: "apps/docs/lib/playground/translations.json",
  now: () => new Date(),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  readExisting: () => readExistingOutput(outputPath),
  writeOutput: (data) => writeAtomically(outputPath, data),
});
