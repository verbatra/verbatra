import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { CheckSummary } from "../flow/check.js";
import type { CheckFileSummary } from "../flow/check-file.js";
import type { checkFileSummarySchema } from "../flow/check-file-schema.js";
import type { checkSummarySchema } from "../flow/check-schema.js";
import type { DataFlowManifest, dataFlowManifestObjectSchema } from "../flow/data-flow-manifest.js";
import type { DiffSummary } from "../flow/diff.js";
import type { diffSummarySchema } from "../flow/diff-schema.js";
import type { DoctorResult } from "../flow/doctor.js";
import type { doctorResultSchema } from "../flow/doctor-schema.js";
import type { ExtractResult } from "../flow/extract.js";
import type { extractResultSchema } from "../flow/extract-schema.js";
import type { GenerateTypesResult } from "../flow/generate-types.js";
import type { generateTypesResultSchema } from "../flow/generate-types-schema.js";
import type { ProvenanceReportResult } from "../flow/provenance-report.js";
import type { provenanceReportResultSchema } from "../flow/provenance-report-schema.js";
import type { PseudolocalizeResult } from "../flow/pseudo.js";
import type { pseudolocalizeResultSchema } from "../flow/pseudo-schema.js";
import type {
  FuzzyCacheHit,
  IntegrityRefusal,
  LocaleSummary,
  NeedsReviewEntry,
  ProtectedKey,
  RunBudget,
  RunEstimate,
  RunSummary,
  UsageSummary,
} from "../flow/summary.js";
import type {
  fuzzyCacheHitSchema,
  integrityRefusalSchema,
  localeSummarySchema,
  needsReviewEntrySchema,
  protectedKeySchema,
  runBudgetSchema,
  runEstimateSchema,
  runSummarySchema,
  usageSummarySchema,
} from "../flow/summary-schema.js";
import type { ExportTmxResult } from "../flow/tmx/export-tmx.js";
import type { exportTmxResultSchema } from "../flow/tmx/export-tmx-schema.js";
import type { ImportTmxResult } from "../flow/tmx/import-tmx.js";
import type { importTmxResultSchema } from "../flow/tmx/import-tmx-schema.js";
import type { ExportWorkbookResult } from "../flow/workbook/export-workbook.js";
import type { exportWorkbookResultSchema } from "../flow/workbook/export-workbook-schema.js";
import type { KeyProvenance, ProvenanceSummary } from "../lock/key-provenance.js";
import type {
  keyProvenanceSchema,
  provenanceSummarySchema,
} from "../lock/key-provenance-schema.js";
import type { LockWaitEvent } from "../lock/locale-write-lock.js";
import type { lockWaitEventSchema } from "../lock/lock-wait-schema.js";
import type { progressEventSchema } from "../progress/progress-schema.js";
import type { ProgressEvent } from "../progress/types.js";

describe("every result schema is pinned both ways to the interface it describes", () => {
  it("pins the run summary and the shapes inside it", () => {
    expectTypeOf<z.output<typeof runSummarySchema>>().toExtend<RunSummary>();
    expectTypeOf<RunSummary>().toExtend<z.output<typeof runSummarySchema>>();
    expectTypeOf<z.output<typeof localeSummarySchema>>().toExtend<LocaleSummary>();
    expectTypeOf<LocaleSummary>().toExtend<z.output<typeof localeSummarySchema>>();
    expectTypeOf<z.output<typeof runEstimateSchema>>().toExtend<RunEstimate>();
    expectTypeOf<RunEstimate>().toExtend<z.output<typeof runEstimateSchema>>();
    expectTypeOf<z.output<typeof usageSummarySchema>>().toExtend<UsageSummary>();
    expectTypeOf<UsageSummary>().toExtend<z.output<typeof usageSummarySchema>>();
    expectTypeOf<z.output<typeof runBudgetSchema>>().toExtend<RunBudget>();
    expectTypeOf<RunBudget>().toExtend<z.output<typeof runBudgetSchema>>();
    expectTypeOf<z.output<typeof needsReviewEntrySchema>>().toExtend<NeedsReviewEntry>();
    expectTypeOf<NeedsReviewEntry>().toExtend<z.output<typeof needsReviewEntrySchema>>();
    expectTypeOf<z.output<typeof fuzzyCacheHitSchema>>().toExtend<FuzzyCacheHit>();
    expectTypeOf<FuzzyCacheHit>().toExtend<z.output<typeof fuzzyCacheHitSchema>>();
    expectTypeOf<z.output<typeof integrityRefusalSchema>>().toExtend<IntegrityRefusal>();
    expectTypeOf<IntegrityRefusal>().toExtend<z.output<typeof integrityRefusalSchema>>();
    expectTypeOf<z.output<typeof protectedKeySchema>>().toExtend<ProtectedKey>();
    expectTypeOf<ProtectedKey>().toExtend<z.output<typeof protectedKeySchema>>();
  });

  it("pins the provenance shapes", () => {
    expectTypeOf<z.output<typeof keyProvenanceSchema>>().toExtend<KeyProvenance>();
    expectTypeOf<KeyProvenance>().toExtend<z.output<typeof keyProvenanceSchema>>();
    expectTypeOf<z.output<typeof provenanceSummarySchema>>().toExtend<ProvenanceSummary>();
    expectTypeOf<ProvenanceSummary>().toExtend<z.output<typeof provenanceSummarySchema>>();
    expectTypeOf<
      z.output<typeof provenanceReportResultSchema>
    >().toExtend<ProvenanceReportResult>();
    expectTypeOf<ProvenanceReportResult>().toExtend<
      z.output<typeof provenanceReportResultSchema>
    >();
  });

  it("pins the check, diff and doctor results", () => {
    expectTypeOf<z.output<typeof checkSummarySchema>>().toExtend<CheckSummary>();
    expectTypeOf<CheckSummary>().toExtend<z.output<typeof checkSummarySchema>>();
    expectTypeOf<z.output<typeof checkFileSummarySchema>>().toExtend<CheckFileSummary>();
    expectTypeOf<CheckFileSummary>().toExtend<z.output<typeof checkFileSummarySchema>>();
    expectTypeOf<z.output<typeof diffSummarySchema>>().toExtend<DiffSummary>();
    expectTypeOf<DiffSummary>().toExtend<z.output<typeof diffSummarySchema>>();
    expectTypeOf<z.output<typeof doctorResultSchema>>().toExtend<DoctorResult>();
    expectTypeOf<DoctorResult>().toExtend<z.output<typeof doctorResultSchema>>();
  });

  it("pins the file-producing command results", () => {
    expectTypeOf<z.output<typeof pseudolocalizeResultSchema>>().toExtend<PseudolocalizeResult>();
    expectTypeOf<PseudolocalizeResult>().toExtend<z.output<typeof pseudolocalizeResultSchema>>();
    expectTypeOf<z.output<typeof generateTypesResultSchema>>().toExtend<GenerateTypesResult>();
    expectTypeOf<GenerateTypesResult>().toExtend<z.output<typeof generateTypesResultSchema>>();
    expectTypeOf<z.output<typeof extractResultSchema>>().toExtend<ExtractResult>();
    expectTypeOf<ExtractResult>().toExtend<z.output<typeof extractResultSchema>>();
    expectTypeOf<z.output<typeof exportWorkbookResultSchema>>().toExtend<ExportWorkbookResult>();
    expectTypeOf<ExportWorkbookResult>().toExtend<z.output<typeof exportWorkbookResultSchema>>();
    expectTypeOf<z.output<typeof importTmxResultSchema>>().toExtend<ImportTmxResult>();
    expectTypeOf<ImportTmxResult>().toExtend<z.output<typeof importTmxResultSchema>>();
    expectTypeOf<z.output<typeof exportTmxResultSchema>>().toExtend<ExportTmxResult>();
    expectTypeOf<ExportTmxResult>().toExtend<z.output<typeof exportTmxResultSchema>>();
  });

  it("pins the stderr records", () => {
    expectTypeOf<z.output<typeof progressEventSchema>>().toExtend<ProgressEvent>();
    expectTypeOf<ProgressEvent>().toExtend<z.output<typeof progressEventSchema>>();
    expectTypeOf<z.output<typeof lockWaitEventSchema>>().toExtend<LockWaitEvent>();
    expectTypeOf<LockWaitEvent>().toExtend<z.output<typeof lockWaitEventSchema>>();
  });
});

type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type OptionalKeys<T> = {
  [K in KnownKeys<T> & keyof T]-?: Partial<Pick<T, K>> extends Pick<T, K> ? K : never;
}[KnownKeys<T> & keyof T];

type KeyShape<T> = T extends readonly (infer Element)[]
  ? KeyShape<Element>
  : T extends object
    ? {
        readonly keys: KnownKeys<T>;
        readonly optional: OptionalKeys<T>;
        readonly fields: { [K in KnownKeys<T> & keyof T]: KeyShape<Exclude<T[K], undefined>> };
      }
    : "leaf";

describe("every result schema lists exactly the fields, and the optional fields, of its type", () => {
  it("matches the run summary down to each locale, estimate and notice", () => {
    expectTypeOf<KeyShape<z.output<typeof runSummarySchema>>>().toEqualTypeOf<
      KeyShape<RunSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof localeSummarySchema>>>().toEqualTypeOf<
      KeyShape<LocaleSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof runEstimateSchema>>>().toEqualTypeOf<
      KeyShape<RunEstimate>
    >();
  });

  it("matches the check, diff and doctor results, the data-flow manifest included", () => {
    expectTypeOf<KeyShape<z.output<typeof checkSummarySchema>>>().toEqualTypeOf<
      KeyShape<CheckSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof checkFileSummarySchema>>>().toEqualTypeOf<
      KeyShape<CheckFileSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof diffSummarySchema>>>().toEqualTypeOf<
      KeyShape<DiffSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof doctorResultSchema>>>().toEqualTypeOf<
      KeyShape<DoctorResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof dataFlowManifestObjectSchema>>>().toEqualTypeOf<
      KeyShape<DataFlowManifest>
    >();
    expectTypeOf<z.output<typeof dataFlowManifestObjectSchema>>().toExtend<DataFlowManifest>();
  });

  it("matches the provenance shapes", () => {
    expectTypeOf<KeyShape<z.output<typeof keyProvenanceSchema>>>().toEqualTypeOf<
      KeyShape<KeyProvenance>
    >();
    expectTypeOf<KeyShape<z.output<typeof provenanceSummarySchema>>>().toEqualTypeOf<
      KeyShape<ProvenanceSummary>
    >();
    expectTypeOf<KeyShape<z.output<typeof provenanceReportResultSchema>>>().toEqualTypeOf<
      KeyShape<ProvenanceReportResult>
    >();
  });

  it("matches the file-producing command results", () => {
    expectTypeOf<KeyShape<z.output<typeof pseudolocalizeResultSchema>>>().toEqualTypeOf<
      KeyShape<PseudolocalizeResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof generateTypesResultSchema>>>().toEqualTypeOf<
      KeyShape<GenerateTypesResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof extractResultSchema>>>().toEqualTypeOf<
      KeyShape<ExtractResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof exportWorkbookResultSchema>>>().toEqualTypeOf<
      KeyShape<ExportWorkbookResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof importTmxResultSchema>>>().toEqualTypeOf<
      KeyShape<ImportTmxResult>
    >();
    expectTypeOf<KeyShape<z.output<typeof exportTmxResultSchema>>>().toEqualTypeOf<
      KeyShape<ExportTmxResult>
    >();
  });

  it("matches the stderr records", () => {
    expectTypeOf<KeyShape<z.output<typeof progressEventSchema>>>().toEqualTypeOf<
      KeyShape<ProgressEvent>
    >();
    expectTypeOf<KeyShape<z.output<typeof lockWaitEventSchema>>>().toEqualTypeOf<
      KeyShape<LockWaitEvent>
    >();
  });
});
