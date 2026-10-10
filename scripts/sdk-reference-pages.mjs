import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SDK_META = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/docs/content/docs/sdk/meta.json",
);

export function sdkReferencePages() {
  return JSON.parse(readFileSync(SDK_META, "utf8")).pages;
}
