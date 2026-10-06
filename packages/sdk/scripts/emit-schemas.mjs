#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { renderJsonSchemas, SDK_JSON_SCHEMAS, verbatraConfigSchema } = await import(
  pathToFileURL(resolve(PACKAGE_ROOT, "dist/index.js")).href
);

const configDocument = z.toJSONSchema(verbatraConfigSchema, { io: "input" });
writeFileSync(
  resolve(PACKAGE_ROOT, "dist/config-schema.json"),
  `${JSON.stringify(configDocument, null, 2)}\n`,
  "utf8",
);

const schemasDir = resolve(PACKAGE_ROOT, "dist/schemas");
rmSync(schemasDir, { recursive: true, force: true });
mkdirSync(schemasDir, { recursive: true });
const documents = renderJsonSchemas(SDK_JSON_SCHEMAS);
for (const [name, document] of Object.entries(documents)) {
  writeFileSync(
    resolve(schemasDir, `${name}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
}

console.log(
  `emit-schemas: wrote dist/config-schema.json and ${Object.keys(documents).length} documents to dist/schemas.`,
);
