import type { SupportedFormat } from "@verbatra/sdk";
import generated from "./format-samples.generated.json";
import { SUPPORTED_FORMAT_IDS } from "./landing-facts";

export type FormatSample = {
  readonly file: string;
  readonly placeholder: string;
  readonly text: string;
};

const SAMPLES = generated as Readonly<Record<string, FormatSample | undefined>>;

function sampleFor(format: SupportedFormat): FormatSample {
  const sample = SAMPLES[format];
  if (sample === undefined) {
    throw new Error(`lib/format-samples.generated.json holds no sample for ${format}`);
  }
  return sample;
}

export const FORMAT_SAMPLES: Readonly<Record<SupportedFormat, FormatSample>> = Object.fromEntries(
  SUPPORTED_FORMAT_IDS.map((format) => [format, sampleFor(format)]),
) as Record<SupportedFormat, FormatSample>;
