export {
  type DoNotTranslateTerm,
  type GlossaryDraftCheck,
  type GlossaryDraftDoNotTranslateCheck,
  type GlossaryDraftTermCheck,
  type LocaleGlossary,
  type LocaleGlossaryTerm,
  type NetworkPolicy,
  type NetworkRule,
  type PlaceholderComparator,
  type PlaceholderExtractor,
  type PluralCategories,
  ProviderError,
  type ProviderErrorCode,
  type ProviderKind,
  type ProviderNetwork,
  type ProviderNotice,
  type ProviderNoticeCode,
  type ProviderRetry,
  type ProviderRetryListener,
  REVIEW_REASON_CODES,
  type ReviewFlag,
  type ReviewReasonCode,
  type Tone,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
  type Usage,
} from "@verbatra/ai-providers";
export {
  type CustomFormatId,
  type FormatId,
  type InconsistencyGroup,
  type InconsistentTranslation,
  isCustomFormatId,
  type LocaleResource,
  type PlaceholderIntegrityResult,
  type PluralCategory,
  type PluralRuleType,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
export type {
  KeyConflict,
  LiteralFinding,
  LiteralScan,
  LiteralSuppressionReason,
  ScanDiagnostic,
  ScanDiagnosticReason,
  SourceExtractor,
  SourceFramework,
  SourceLocation,
  SuppressedLiteral,
} from "@verbatra/extract";
export {
  AdapterError,
  type AdapterErrorCode,
  type AdapterFs,
  AdapterRegistry,
  type AdapterResolution,
  type BoundedReadOutcome,
  type BuildWriteTree,
  type CompareBranchArms,
  type ComparePlaceholders,
  type ComputeInvalidIcuKeys,
  createDefaultRegistry,
  createFlatFileAdapter,
  createTreeFileAdapter,
  type DeriveDescriptions,
  type DeriveEntry,
  type ExtractPlaceholders,
  type FlatFileAdapterOptions,
  type FlatParseOutcome,
  type FlatParseResult,
  type FormatAdapter,
  type JsonLeaf,
  type JsonRecord,
  type JsonTree,
  type KeyMode,
  nodeAdapterFs,
  type OrderedRecord,
  type OrderedValue,
  type PluralCategoryLookup,
  type ReadResult,
  type ResolveOptions,
  type Sniff,
  type SyntaxPosition,
  type TreeFileAdapterOptions,
  type ValidateMessage,
  type ValidateTree,
  type WriteContext,
} from "@verbatra/format-adapters";
export { CACHE_FILE_NAME } from "./cache/translation-memory.js";
export type { TranslationMemory } from "./cache/types.js";
export type { AuthoringConfig, AuthoringConfigFor } from "./config/authoring.js";
export { defineConfig } from "./config/define-config.js";
export type { ExtractionConfig } from "./config/extraction-config.js";
export {
  type Glossary,
  type GlossaryDefinition,
  type GlossaryDoNotTranslateDefinition,
  type GlossaryInput,
  type GlossaryTerm,
  type GlossaryTermDefinition,
  glossaryForLocale,
  normalizeGlossary,
  type RedactedGlossary,
  redactGlossary,
  sharedGlossaryTranslations,
} from "./config/glossary.js";
export {
  type EditConfiguredGlossaryTermInput,
  editConfiguredGlossaryTerm,
  type GlossaryConfig,
  type GlossaryFileDeps,
  type GlossaryFileInput,
  type ReadCurrentGlossaryInput,
  readCurrentGlossary,
  readGlossaryFile,
  type UpdateGlossaryTermInput,
  updateGlossaryTerm,
} from "./config/glossary-file.js";
export {
  type GlossaryDraftCheckInput,
  type GlossaryHitsInput,
  glossaryDraftCheck,
  glossaryHits,
} from "./config/glossary-hits.js";
export type { HumanEditsPolicy } from "./config/human-edits.js";
export {
  type ConfigCandidateOptions,
  type ConfigSource,
  configCandidatePaths,
  type LoadConfigOptions,
  type LoadedConfig,
  loadConfig,
  loadConfigWithMeta,
} from "./config/load-config.js";
export {
  assertMachineTranslationEnabled,
  isMachineTranslationEnabled,
} from "./config/machine-translation.js";
export type { BillingUnit, ProviderBilling } from "./config/provider-billing.js";
export type { ProviderConfig, ProviderId } from "./config/provider-config.js";
export { declareProviderKeyEnvVar } from "./config/provider-key-env.js";
export type {
  CharacterRate,
  ModelRate,
  RateCard,
  TokenRate,
} from "./config/rate-card.js";
export type { GlossaryProvenance } from "./config/resolve-glossary.js";
export {
  type VerbatraConfig,
  type VerbatraConfigInput,
  verbatraConfigSchema,
} from "./config/schema.js";
export {
  type DetectedFormat,
  type DetectedFormatSource,
  type DetectedLocaleLayout,
  type DetectionAmbiguity,
  type DetectionConfidence,
  type DetectProjectDeps,
  type DetectProjectInput,
  detectProject,
  type ProjectDetection,
} from "./detection/detect-project.js";
export { errorHint } from "./error-hints.js";
export { SdkError, type SdkErrorCode } from "./errors.js";
export {
  type ApproveLocaleDeps,
  type ApproveLocaleInput,
  type ApproveLocaleResult,
  approveLocale,
} from "./flow/approve-locale.js";
export { type BudgetStanding, budgetStanding } from "./flow/budget.js";
export {
  type CheckDeps,
  type CheckInput,
  type CheckReviewCode,
  type CheckReviewSummary,
  type CheckSummary,
  check,
  type LocaleCheckSummary,
  type LocaleReviewReport,
} from "./flow/check.js";
export {
  type CheckFileDeps,
  type CheckFileFinding,
  type CheckFileInput,
  type CheckFileRole,
  type CheckFileSummary,
  checkFile,
  type FileQaReport,
  type LocaleFileCheck,
  type QaSyntaxFinding,
} from "./flow/check-file.js";
export {
  type DiffDeps,
  type DiffInput,
  type DiffSummary,
  diff,
  type LocaleDiff,
} from "./flow/diff.js";
export {
  type DoctorCheck,
  type DoctorCheckId,
  type DoctorCheckStatus,
  type DoctorDeps,
  type DoctorInput,
  type DoctorResult,
  doctor,
} from "./flow/doctor.js";
export {
  type EditEntryActor,
  type EditEntryDeps,
  type EditEntryInput,
  type EditEntryResult,
  editEntry,
} from "./flow/edit-entry.js";
export {
  approveEntries,
  type BatchEntry,
  type BatchEntryFailure,
  type BatchEntrySkipped,
  BatchInterruptedError,
  type RetranslateBatchOutcome,
  type RetranslateEntriesInput,
  type RetranslateEntriesResult,
  type ReviewBatchEntry,
  type ReviewBatchOutcome,
  type ReviewEntriesInput,
  type ReviewEntriesResult,
  rejectEntries,
  retranslateEntries,
} from "./flow/entry-batch.js";
export {
  type AddedKey,
  type ExtractDeps,
  type ExtractInput,
  type ExtractResult,
  extract,
} from "./flow/extract.js";
export {
  DEFAULT_TYPES_PATH,
  type GenerateTypesDeps,
  type GenerateTypesInput,
  type GenerateTypesResult,
  generateTypes,
  type UnresolvedMessage,
} from "./flow/generate-types.js";
export {
  type GitExecFile,
  type GitExecFileResult,
  LOCALE_HISTORY_LIMIT_CAP,
  LOCALE_HISTORY_LIMIT_DEFAULT,
  LOCALE_HISTORY_MAX_OUTPUT_BYTES,
  LOCALE_HISTORY_TIMEOUT_MS,
  LOCALE_HISTORY_UNAVAILABLE_REASONS,
  type LocaleHistoryCommit,
  type LocaleHistoryResult,
  type LocaleHistoryUnavailableReason,
} from "./flow/git-log.js";
export {
  INTEGRITY_GATE_REASONS,
  type IntegrityGateReason,
} from "./flow/integrity-gate.js";
export {
  type KeyContext,
  type KeyContextDeps,
  type KeyContextGlossaryNotice,
  type KeyContextInput,
  keyContext,
} from "./flow/key-context.js";
export {
  type KeyIntegrityDeps,
  type KeyIntegrityEntry,
  type KeyIntegrityInput,
  keyIntegrity,
  type LocaleKeyIntegrity,
} from "./flow/key-integrity.js";
export {
  type KeyValueDeps,
  type KeyValueInput,
  type KeyValueResult,
  keyValue,
} from "./flow/key-value.js";
export type {
  LanguageTableRefresh,
  LanguageTableRefreshStatus,
  LocaleCapability,
  LocaleCapabilityReport,
  LocaleCapabilityWarning,
  LocaleCapabilityWarningCode,
  LocaleSupport,
  SourceLocaleCapability,
} from "./flow/locale-capabilities.js";
export {
  type LocaleHistoryDeps,
  type LocaleHistoryInput,
  localeHistory,
} from "./flow/locale-history.js";
export {
  type LocaleIntegrityDeps,
  type LocaleIntegrityInput,
  localeIntegrity,
} from "./flow/locale-integrity.js";
export {
  diffLocaleSnapshots,
  type LocaleFileSnapshot,
  type LocaleSnapshotDelta,
  type ReadLocaleFileSnapshotDeps,
  type ReadLocaleFileSnapshotInput,
  readLocaleFileSnapshot,
} from "./flow/locale-snapshot.js";
export {
  type KeyValuePair,
  type LocaleValues,
  type LocaleValuesDeps,
  type LocaleValuesInput,
  localeValues,
} from "./flow/locale-values.js";
export {
  LOCALE_VALUES_QUERY_MAX_LENGTH,
  type LocaleValuesPage,
  type LocaleValuesPageEntry,
  type LocaleValuesPageInput,
  type LocaleValuesPageLocale,
  localeValuesPage,
} from "./flow/locale-values-page.js";
export {
  type LockLocaleState,
  type LockStateDeps,
  type LockStateInput,
  type LockStateResult,
  lockState,
} from "./flow/lock-state.js";
export type { UnresolvedArgumentReason } from "./flow/message-arguments.js";
export type { IncompletePlural } from "./flow/plural-completeness.js";
export {
  PROVENANCE_BUCKETS,
  type ProvenanceBucket,
  type ProvenanceReport,
  type ProvenanceReportDeps,
  type ProvenanceReportEntry,
  type ProvenanceReportInput,
  type ProvenanceReportLocale,
  type ProvenanceReportResult,
  provenanceReport,
} from "./flow/provenance-report.js";
export {
  type ProvenanceReportPage,
  type ProvenanceReportPageInput,
  type ProvenanceReportPageLocale,
  type ProvenanceReportPageResult,
  provenanceReportPage,
} from "./flow/provenance-report-page.js";
export {
  type PseudolocalizeDeps,
  type PseudolocalizeInput,
  type PseudolocalizeResult,
  pseudolocalize,
} from "./flow/pseudo.js";
export {
  type CheckQaSummary,
  type LocaleQaReport,
  QA_SEVERITIES,
  type QaFinding,
  type QaIntegrityFinding,
  type QaReviewFinding,
  type QaSeverity,
} from "./flow/qa-check.js";
export {
  type RetranslateEntryDeps,
  type RetranslateEntryInput,
  type RetranslateEntryResult,
  retranslateEntry,
} from "./flow/retranslate-entry.js";
export {
  approveEntry,
  type ReviewDecisionDeps,
  type ReviewDecisionInput,
  type ReviewDecisionResult,
  rejectEntry,
} from "./flow/review-decision.js";
export {
  type ReviewQueueDeps,
  type ReviewQueueEntry,
  type ReviewQueueInput,
  type ReviewQueueLocale,
  type ReviewQueueResult,
  reviewQueue,
} from "./flow/review-queue.js";
export {
  RUN_STATUS_UNAVAILABLE_REASONS,
  type RunStatusDeps,
  type RunStatusInput,
  type RunStatusResult,
  type RunStatusUnavailableReason,
  runStatus,
} from "./flow/run-status.js";
export type {
  BudgetBehavior,
  CharacterRunQuantity,
  DuplicateKeyReport,
  EstimateCaveatCode,
  EstimateIdentity,
  EstimatePricing,
  FuzzyCacheHit,
  IntegrityRefusal,
  LocaleEstimate,
  LocaleEstimateQuantity,
  LocaleNotice,
  LocaleSummary,
  MalformedRowReport,
  NeedsReviewEntry,
  PricedLocaleEstimate,
  PricedRunEstimate,
  ProtectedKey,
  ProtectionReason,
  RunBudget,
  RunEstimate,
  RunEstimateQuantity,
  RunSummary,
  SdkNotice,
  SdkNoticeCode,
  SuggestionStatus,
  TokenRunQuantity,
  UnpricedLocaleEstimate,
  UnpricedRunEstimate,
  UsageSummary,
} from "./flow/summary.js";
export {
  DEFAULT_TMX_PATH,
  type ExportTmxDeps,
  type ExportTmxInput,
  type ExportTmxLocaleCount,
  type ExportTmxResult,
  exportTmx,
} from "./flow/tmx/export-tmx.js";
export {
  type ImportTmxDeps,
  type ImportTmxInput,
  type ImportTmxLocaleResult,
  type ImportTmxResult,
  importTmx,
  type TmxErrorLocation,
  type TmxLanguageReport,
  type TmxRejectionCounts,
  type TmxRejectionReason,
  type TmxUnitRefusal,
  tmxErrorLocation,
} from "./flow/tmx/import-tmx.js";
export type { TmxOrigin, TmxReview } from "./flow/tmx/tmx-origin.js";
export {
  resolveDryRun,
  type TranslateDeps,
  type TranslateInput,
  translate,
} from "./flow/translate-project.js";
export type {
  PossiblyDynamicKey,
  UnusedKey,
  UnusedKeysNotRun,
  UnusedKeysNotRunReason,
  UnusedKeysPrefixSite,
  UnusedKeysReport,
  UnusedKeysScan,
  UnusedKeysSite,
  UnusedKeysUnreliability,
  UnusedKeysUnreliableReason,
} from "./flow/unused-keys.js";
export { createValueMarker, type ValueMarker } from "./flow/value-marker.js";
export {
  DEFAULT_EXCHANGE_FORMAT,
  EXCHANGE_FORMATS,
  type ExchangeFormat,
  type XliffFormat,
} from "./flow/workbook/exchange-format.js";
export {
  DEFAULT_DELIMITED_PATH,
  DEFAULT_WORKBOOK_PATH,
  type ExportWorkbookDeps,
  type ExportWorkbookInput,
  type ExportWorkbookResult,
  exportWorkbook,
} from "./flow/workbook/export-workbook.js";
export {
  type ImportWorkbookDeps,
  type ImportWorkbookInput,
  importWorkbook,
} from "./flow/workbook/import-workbook.js";
export type { BoundedBytesRead, BoundedFileRead, DirectoryEntry, SdkFs } from "./fs.js";
export {
  createLocalePathResolver,
  type LocalePathResolver,
  type LocalePathResolverConfig,
} from "./locale-path/resolver.js";
export type { LocaleStyle } from "./locale-path/style.js";
export {
  type KeyOrigin,
  type KeyProvenance,
  type KeyReviewState,
  MACHINE_CLASS_ORIGINS,
  type MachineClassOrigin,
  type ProvenanceMarkers,
  type ProvenanceSummary,
} from "./lock/key-provenance.js";
export {
  type LoadLockFileDeps,
  type LoadLockFileInput,
  loadLockFile,
} from "./lock/load-lock-file.js";
export {
  type LoadProvenanceDeps,
  type LoadProvenanceInput,
  loadProvenance,
} from "./lock/load-provenance.js";
export {
  type LockHolder,
  type LockWaitEvent,
  type LockWaitListener,
  releaseHeldLocks,
} from "./lock/locale-write-lock.js";
export { LOCK_FILE_NAME } from "./lock/lock-file.js";
export {
  PROVENANCE_FILE_NAME,
  type ProvenanceFile,
  type ProvenanceOrigin,
  type ProvenanceRecord,
  type ProvenanceReviewState,
} from "./lock/provenance-file.js";
export type { LockFile } from "./lock/types.js";
export {
  PAGE_CURSOR_MAX_LENGTH,
  PAGE_LIMIT_CAP,
  PAGE_LIMIT_DEFAULT,
} from "./paging/page-across-locales.js";
export type {
  BatchFinishedEvent,
  ChangeDetectedEvent,
  IdleEvent,
  LocaleFinishedEvent,
  LocalePlannedEvent,
  LocaleStartedEvent,
  ProgressEvent,
  ProgressListener,
  ProviderRetryEvent,
  RepairEvent,
  RunFinishedEvent,
  ScanProgressEvent,
  ScanProgressListener,
  SplitRetryEvent,
  SubBatchProgressEvent,
  WritingEvent,
} from "./progress/types.js";
export { projectRelativeMessage } from "./project-relative.js";
export { redact } from "./redact.js";
export type { RunStatusFile, RunStatusLocale } from "./run-status/types.js";
export { type ScaffoldableProviderId, scaffoldingMetadata } from "./scaffolding.js";
export type {
  CreateProvider,
  CreateProviderContext,
  CreateProviderHooks,
} from "./selection/select-provider.js";
export type { CheckSensitiveSummary, SensitiveKeyFinding } from "./sensitive/check-scan.js";
export type { SensitiveField } from "./sensitive/guard.js";
export type { SensitiveFindingSource } from "./sensitive/scan-text.js";
export {
  type CreateWatcher,
  type RunTranslate,
  type WatchController,
  type WatchDeps,
  type Watcher,
  type WatchInput,
  type WatchRunResult,
  watch,
} from "./watch/watch.js";
