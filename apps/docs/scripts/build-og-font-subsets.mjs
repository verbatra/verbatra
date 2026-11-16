import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildOgFontSubsets, localesWithOgFonts } from "../lib/og-subset.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { "source-dir": { type: "string" } } });

const locales = localesWithOgFonts();
if (locales.length === 0) {
  console.log("No locale configures an extra OG font: nothing to subset.");
} else if (values["source-dir"] === undefined) {
  console.error(`Pass --source-dir <dir holding the source fonts> for: ${locales.join(", ")}.`);
  process.exitCode = 2;
} else {
  const written = await buildOgFontSubsets({ root, sourceDir: resolve(values["source-dir"]) });
  for (const file of written) console.log(`wrote ${file}`);
}
