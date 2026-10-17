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

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../lib/format-samples.generated.json");

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
