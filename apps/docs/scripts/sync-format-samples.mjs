import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRegistry } from "@verbatra/sdk";
import {
  FORMAT_SAMPLE_SPECS,
  memoryAdapterFs,
  SAMPLE_SOURCE_LOCALE,
  sampleEntries,
  sampleSkeleton,
} from "../lib/format-samples-seed.mjs";
import {
  HERO_DIFF_FORMAT,
  HERO_DIFF_SOURCE,
  HERO_DIFF_SOURCE_FILE,
  HERO_DIFF_SOURCE_LOCALE,
  HERO_DIFF_TARGET_FILE,
  HERO_DIFF_TARGET_FILLED,
  HERO_DIFF_TARGET_LOCALE,
  HERO_DIFF_TARGET_SYNCED,
  heroDiffLine,
} from "../lib/hero-diff-seed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../lib/format-samples.generated.json");
const heroDiffPath = resolve(here, "../lib/hero-diff.generated.json");

async function renderSample(registry, files, format) {
  const { file, placeholder } = FORMAT_SAMPLE_SPECS[format];
  const resolution = registry.resolve(file, { format });
  if (resolution.status !== "resolved") {
    throw new Error(`No adapter resolves ${file} as ${format}`);
  }
  const { adapter } = resolution;
  const values = sampleEntries(format);
  const skeleton = sampleSkeleton(
    format,
    values.map((entry) => entry.key),
  );
  if (skeleton !== undefined) files.set(file, skeleton);
  const entries = new Map(
    values.map(({ key, value }) => [
      key,
      {
        key,
        namespace: "",
        value,
        placeholders: adapter.extractPlaceholders(value),
        isPlural: false,
      },
    ]),
  );
  await adapter.write({ locale: SAMPLE_SOURCE_LOCALE, namespace: "", format, entries }, file, {
    sourcePath: file,
  });
  const text = files.get(file);
  if (text === undefined) throw new Error(`The ${format} adapter wrote nothing to ${file}`);
  return { file, placeholder, text };
}

const files = new Map();
const registry = createDefaultRegistry(memoryAdapterFs(files));
const samples = {};
for (const format of Object.keys(FORMAT_SAMPLE_SPECS)) {
  samples[format] = await renderSample(registry, files, format);
}

writeFileSync(outputPath, `${JSON.stringify(samples, null, 2)}\n`);

async function writeHeroFile(file, locale, values) {
  const resolution = registry.resolve(file, { format: HERO_DIFF_FORMAT });
  if (resolution.status !== "resolved") throw new Error(`No adapter resolves ${file}`);
  const { adapter } = resolution;
  const entries = new Map(
    values.map(({ key, value }) => [
      key,
      {
        key,
        namespace: "",
        value,
        placeholders: adapter.extractPlaceholders(value),
        isPlural: false,
      },
    ]),
  );
  await adapter.write({ locale, namespace: "", format: HERO_DIFF_FORMAT, entries }, file, {
    sourcePath: HERO_DIFF_SOURCE_FILE,
  });
  const text = files.get(file);
  if (text === undefined) throw new Error(`The adapter wrote nothing to ${file}`);
  return text;
}

function lineOf(text, entry) {
  const index = text.split("\n").findIndex((line) => line.includes(heroDiffLine(entry)));
  if (index === -1) throw new Error(`${entry.key} is not on its own line`);
  return index;
}

const heroSource = await writeHeroFile(
  HERO_DIFF_SOURCE_FILE,
  HERO_DIFF_SOURCE_LOCALE,
  HERO_DIFF_SOURCE,
);
const heroTarget = await writeHeroFile(HERO_DIFF_TARGET_FILE, HERO_DIFF_TARGET_LOCALE, [
  ...HERO_DIFF_TARGET_SYNCED,
  ...HERO_DIFF_TARGET_FILLED,
]);

writeFileSync(
  heroDiffPath,
  `${JSON.stringify(
    {
      source: { file: HERO_DIFF_SOURCE_FILE, text: heroSource },
      target: {
        file: HERO_DIFF_TARGET_FILE,
        text: heroTarget,
        filled: HERO_DIFF_TARGET_FILLED.map((entry) => ({
          key: entry.key,
          line: lineOf(heroTarget, entry),
        })),
      },
    },
    null,
    2,
  )}\n`,
);
