import type { AdapterFs, SupportedFormat } from "@verbatra/sdk";

export type SampleKeyStyle = "dotted" | "snake" | "camel";

export interface FormatSampleSpec {
  readonly file: string;
  readonly placeholder: string;
  readonly keys: SampleKeyStyle;
}

export interface SampleSourceEntry {
  readonly path: readonly [string, string];
  readonly value: string;
}

export interface SampleEntry {
  readonly key: string;
  readonly value: string;
}

export declare const SAMPLE_SOURCE_LOCALE: string;

export declare const SAMPLE_SOURCE_PLACEHOLDER: string;

export declare const SAMPLE_SOURCE: ReadonlyArray<SampleSourceEntry>;

export declare const FORMAT_SAMPLE_SPECS: Readonly<Record<SupportedFormat, FormatSampleSpec>>;

export declare function sampleEntries(format: SupportedFormat): ReadonlyArray<SampleEntry>;

export declare function sampleSkeleton(
  format: SupportedFormat,
  keys: ReadonlyArray<string>,
): string | undefined;

export declare function memoryAdapterFs(files: Map<string, string>): AdapterFs;
