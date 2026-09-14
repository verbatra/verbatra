import type { SourceFramework } from "./framework.js";

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

export interface ExtractedCallSite {
  readonly key: string;
  readonly defaultValue?: string;
  readonly line: number;
}

export interface DynamicCallSite {
  readonly line: number;
}

export interface FileExtraction {
  readonly calls: readonly ExtractedCallSite[];
  readonly dynamic: readonly DynamicCallSite[];
}

export interface SourceExtractor {
  readonly framework: SourceFramework;
  readonly extensions: readonly string[];
  extract(file: SourceFile): FileExtraction;
}
