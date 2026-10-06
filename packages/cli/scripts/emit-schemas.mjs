#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderJsonSchemas, SDK_JSON_SCHEMAS } from "@verbatra/sdk";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { CLI_JSON_SCHEMAS } = await import(
  pathToFileURL(
    resolve(PACKAGE_ROOT, "node_modules/.cache/verbatra-cli-schemas/json-envelope-schema.js"),
  ).href
);

const schemasDir = resolve(PACKAGE_ROOT, "dist/schemas");
rmSync(schemasDir, { recursive: true, force: true });
mkdirSync(schemasDir, { recursive: true });
const documents = renderJsonSchemas(CLI_JSON_SCHEMAS, SDK_JSON_SCHEMAS);
for (const [name, document] of Object.entries(documents)) {
  writeFileSync(
    resolve(schemasDir, `${name}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
}

console.log(`emit-schemas: wrote ${Object.keys(documents).length} documents to dist/schemas.`);
