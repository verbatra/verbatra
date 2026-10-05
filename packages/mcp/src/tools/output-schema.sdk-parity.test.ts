import type {
  approveEntry,
  check,
  DoctorCheckStatus,
  diff,
  doctor,
  editEntry,
  Glossary,
  glossaryForLocale,
  keyContext,
  keyValue,
  localeHistory,
  localeValuesPage,
  lockState,
  provenanceReport,
  provenanceReportPage,
  retranslateEntry,
  reviewQueue,
  translate,
} from "@verbatra/sdk";
import { describe, expectTypeOf, it } from "vitest";
import type { EditEntryResult } from "./edit-entry.js";
import type { EstimateResult } from "./estimate.js";
import type { GlossaryResult, LocaleTerm } from "./glossary.js";
import type { HistoryListResult } from "./history-list.js";
import type { KeyContextResult } from "./key-context.js";
import type { KeyValueResult } from "./key-value.js";
import type { LocaleValuesResult } from "./locale-values.js";
import type { LockStateResult } from "./lock-state.js";
import type { ProjectDoctorResult } from "./project-doctor.js";
import type { ReportProvenanceResult } from "./report-provenance.js";
import type { RetranslateEntryResult } from "./retranslate-entry.js";
import type { ReviewDecisionResult } from "./review-decision.js";
import type { ReviewQueueResult } from "./review-queue.js";
import type { RunSummary } from "./run-schema.js";
import type { StatusCheckResult } from "./status-check.js";
import type { StatusDiffResult } from "./status-diff.js";

type FieldPaths<T, Prefix extends string = ""> = T extends readonly (infer Element)[]
  ? FieldPaths<Element, Prefix>
  : T extends object
    ? {
        [K in keyof T & string]-?:
          | `${Prefix}${K}`
          | FieldPaths<NonNullable<T[K]>, `${Prefix}${K}.`>;
      }[keyof T & string]
    : never;

type Undeclared<SdkResult, Declared, NeverRequested extends string = never> = Exclude<
  FieldPaths<SdkResult>,
  FieldPaths<Declared> | NeverRequested | `${NeverRequested}.${string}`
>;

type SdkResult<Fn extends (...args: never[]) => unknown> = Awaited<ReturnType<Fn>>;

describe("output schemas declare every field the SDK result they pass through carries", () => {
  it("status.check", () => {
    expectTypeOf<
      Undeclared<
        SdkResult<typeof check>,
        StatusCheckResult,
        "qa" | "review" | "sensitive" | "locales.qa" | "locales.review" | "locales.inconsistencies"
      >
    >().toEqualTypeOf<never>();
  });

  it("status.diff", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof diff>, StatusDiffResult, "unused">
    >().toEqualTypeOf<never>();
  });

  it("lock.state", () => {
    expectTypeOf<Undeclared<SdkResult<typeof lockState>, LockStateResult>>().toEqualTypeOf<never>();
  });

  it("translation.translatePending and translation.estimate", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof translate>, RunSummary, "estimate">
    >().toEqualTypeOf<never>();
    expectTypeOf<Undeclared<SdkResult<typeof translate>, EstimateResult>>().toEqualTypeOf<never>();
  });

  it("translation.editEntry and translation.retranslateEntry", () => {
    expectTypeOf<Undeclared<SdkResult<typeof editEntry>, EditEntryResult>>().toEqualTypeOf<never>();
    expectTypeOf<
      Undeclared<SdkResult<typeof retranslateEntry>, RetranslateEntryResult>
    >().toEqualTypeOf<never>();
  });

  it("history.list", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof localeHistory>, HistoryListResult>
    >().toEqualTypeOf<never>();
  });

  it("key.value and key.context", () => {
    expectTypeOf<Undeclared<SdkResult<typeof keyValue>, KeyValueResult>>().toEqualTypeOf<never>();
    expectTypeOf<
      Undeclared<SdkResult<typeof keyContext>, KeyContextResult>
    >().toEqualTypeOf<never>();
  });

  it("review.queue, review.approve and review.reject", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof reviewQueue>, ReviewQueueResult, "locales.approved">
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Undeclared<SdkResult<typeof approveEntry>, ReviewDecisionResult>
    >().toEqualTypeOf<never>();
  });

  it("locale.values", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof localeValuesPage>, LocaleValuesResult>
    >().toEqualTypeOf<never>();
  });

  it("report.provenance", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof provenanceReport>, ReportProvenanceResult>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Undeclared<SdkResult<typeof provenanceReportPage>, ReportProvenanceResult>
    >().toEqualTypeOf<never>();
  });

  it("project.doctor", () => {
    expectTypeOf<
      Undeclared<SdkResult<typeof doctor>, ProjectDoctorResult, "literals" | "locales" | "dataFlow">
    >().toEqualTypeOf<never>();
    expectTypeOf<
      ProjectDoctorResult["checks"][number]["status"]
    >().toEqualTypeOf<DoctorCheckStatus>();
  });

  it("glossary.get and glossary.write", () => {
    expectTypeOf<
      Undeclared<Glossary["terms"][number], GlossaryResult["terms"][number]>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Undeclared<NonNullable<ReturnType<typeof glossaryForLocale>>["terms"][number], LocaleTerm>
    >().toEqualTypeOf<never>();
  });
});
