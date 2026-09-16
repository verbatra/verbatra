export { TEMPLATE_FILE_EXTENSIONS } from "./discovery.js";
export type {
  DynamicCallSite,
  ExtractedCallSite,
  FileExtraction,
  KeyPrefixSite,
  KeyUsage,
  ReferencedKeySite,
  SourceExtractor,
  SourceFile,
  UnresolvedKeySite,
  UnresolvedKeySiteReason,
} from "./extractor.js";
export { SOURCE_FRAMEWORKS, type SourceFramework, sourceFrameworkSchema } from "./framework.js";
export {
  createI18nextExtractor,
  I18NEXT_TRANSLATION_ELEMENTS,
} from "./i18next/i18next-extractor.js";
export { toReportedPath } from "./reported-path.js";
export {
  type ExtractedKey,
  type KeyConflict,
  type KeyPrefixLocation,
  type ProjectKeyUsage,
  type ProjectScan,
  type ScanDiagnostic,
  type ScanDiagnosticReason,
  type ScanProjectInput,
  type SourceLocation,
  scanProject,
  type UnresolvedKeyLocation,
} from "./scan-project.js";
export {
  type BoundedSourceRead,
  type DirectoryEntry,
  nodeSourceFs,
  type SourceFs,
} from "./source-fs-port.js";
