import { join } from "node:path";
import { z } from "zod";
import type { SdkFs } from "../../fs.js";
import type { HandoffFamily } from "./exchange-format.js";

const MANIFEST_VERSION = 1;

const MAX_MANIFEST_BYTES = 1024 * 1024;

export function exportManifestFileName(family: HandoffFamily): string {
  return `.verbatra-export-${family}.json`;
}

const manifestSchema = z.object({
  version: z.number().int().positive(),
  format: z.enum(["csv", "tsv", "xliff"]),
  locales: z.array(z.string()),
});

export async function writeExportManifest(
  fs: SdkFs,
  directory: string,
  format: HandoffFamily,
  locales: readonly string[],
): Promise<void> {
  const manifest = { version: MANIFEST_VERSION, format, locales: [...locales] };
  await fs.writeFile(
    join(directory, exportManifestFileName(format)),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export async function readExportedLocales(
  fs: SdkFs,
  directory: string,
  format: HandoffFamily,
): Promise<ReadonlySet<string> | undefined> {
  const read = await fs.readFileBounded(
    join(directory, exportManifestFileName(format)),
    MAX_MANIFEST_BYTES,
  );
  if (read.kind !== "ok") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    return undefined;
  }
  const result = manifestSchema.safeParse(parsed);
  if (
    !result.success ||
    result.data.version !== MANIFEST_VERSION ||
    result.data.format !== format
  ) {
    return undefined;
  }
  return new Set(result.data.locales);
}
