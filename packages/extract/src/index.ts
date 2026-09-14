export {
  DEFAULT_EXCLUDED_DIRECTORIES,
  discoverSourceFiles,
  SOURCE_EXTENSIONS,
  type SourceDiscoveryInput,
} from "./discovery.js";
export type {
  DynamicCallSite,
  ExtractedCallSite,
  FileExtraction,
  SourceExtractor,
  SourceFile,
} from "./extractor.js";
export {
  SOURCE_FRAMEWORKS,
  type SourceFramework,
  sourceFrameworkSchema,
} from "./framework.js";
export { createI18nextExtractor } from "./i18next/i18next-extractor.js";
export {
  DEFAULT_MAX_SOURCE_FILE_BYTES,
  type ExtractedKey,
  type KeyConflict,
  type ProjectScan,
  type ScanDiagnostic,
  type ScanDiagnosticReason,
  type ScanProjectInput,
  type SourceLocation,
  scanProject,
} from "./scan-project.js";
export {
  type BoundedSourceRead,
  type DirectoryEntry,
  type DirectoryEntryKind,
  nodeSourceFs,
  type SourceFs,
} from "./source-fs-port.js";
