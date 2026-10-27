import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { SdkFs } from "../../fs.js";
import { readReportableProvenance } from "../../lock/key-provenance.js";
import {
  localeRecords,
  type ProvenancePatch,
  type ProvenanceRecord,
} from "../../lock/provenance-file.js";
import { decidedRecord } from "../review-decision.js";
import type { LocaleSummary, SdkNotice } from "../summary.js";

export interface HandoffApprovals {
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly locale: string;
  readonly approved: ReadonlySet<string>;
  readonly written: LocaleResource;
  readonly source: LocaleResource;
  readonly reviewer: string | undefined;
}

export function recordableApprovals(
  approved: ReadonlySet<string>,
  entries: ReadonlyMap<string, TranslationEntry>,
  source: LocaleResource,
): ReadonlySet<string> {
  return new Set(
    [...approved].filter((key) => entries.get(key)?.value !== undefined && source.entries.has(key)),
  );
}

async function priorRecords(
  approvals: HandoffApprovals,
): Promise<ReadonlyMap<string, ProvenanceRecord>> {
  const file = await readReportableProvenance(approvals.cwd, approvals.fs);
  return file === undefined ? new Map() : localeRecords(file, approvals.locale);
}

export async function withHandoffApprovals(
  patch: ProvenancePatch,
  approvals: HandoffApprovals,
): Promise<ProvenancePatch> {
  if (approvals.approved.size === 0) {
    return patch;
  }
  const prior = await priorRecords(approvals);
  const records = new Map(patch.records);
  const replace = new Set(patch.replace);
  for (const key of approvals.approved) {
    const value = approvals.written.entries.get(key)?.value;
    const sourceEntry = approvals.source.entries.get(key);
    if (value === undefined || sourceEntry === undefined) {
      continue;
    }
    records.set(
      key,
      decidedRecord(records.get(key) ?? prior.get(key), value, {
        reviewState: "approved",
        ...(approvals.reviewer !== undefined ? { reviewer: approvals.reviewer } : {}),
        reviewedSourceHash: contentHash(sourceEntry),
      }),
    );
    replace.add(key);
  }
  return { ...patch, records, replace };
}

function approvalNotice(count: number, dryRun: boolean): SdkNotice {
  const keys = count === 1 ? "1 key" : `${count} keys`;
  const verb = dryRun ? "would be" : count === 1 ? "was" : "were";
  return {
    code: "HANDOFF_REVIEWS_RECORDED",
    message: `${keys} the handoff marks reviewed or final ${verb} recorded as approved.`,
  };
}

export function withApprovalNotice(
  summary: LocaleSummary,
  approved: ReadonlySet<string>,
  dryRun: boolean,
): LocaleSummary {
  if (approved.size === 0) {
    return summary;
  }
  return { ...summary, notices: [...summary.notices, approvalNotice(approved.size, dryRun)] };
}
