import type { RegisteredMcpTool } from "./define-tool.js";
import { editEntryTool } from "./edit-entry.js";
import { estimateTool } from "./estimate.js";
import { glossaryGetTool, glossaryWriteTool } from "./glossary.js";
import { keyIntegrityTool } from "./key-integrity.js";
import { keyValueTool } from "./key-value.js";
import { lockStateTool } from "./lock-state.js";
import { projectDoctorTool } from "./project-doctor.js";
import { projectSnapshotTool } from "./project-snapshot.js";
import { retranslateEntryTool } from "./retranslate-entry.js";
import { reviewApproveTool, reviewRejectTool } from "./review-decision.js";
import { reviewQueueTool } from "./review-queue.js";
import { statusCheckTool } from "./status-check.js";
import { statusDiffTool } from "./status-diff.js";
import { translatePendingTool } from "./translate-pending.js";
import { usageSummaryTool } from "./usage-summary.js";

const SPEND_TOOL_NAMES: ReadonlySet<string> = new Set([
  retranslateEntryTool.name,
  translatePendingTool.name,
]);

const ALL_TOOLS_IN_ORDER: readonly RegisteredMcpTool[] = [
  projectSnapshotTool,
  projectDoctorTool,
  statusCheckTool,
  statusDiffTool,
  glossaryGetTool,
  glossaryWriteTool,
  lockStateTool,
  keyIntegrityTool,
  keyValueTool,
  editEntryTool,
  estimateTool,
  retranslateEntryTool,
  translatePendingTool,
  reviewQueueTool,
  reviewApproveTool,
  reviewRejectTool,
  usageSummaryTool,
];

export function buildToolRegistry(allowSpend: boolean): readonly RegisteredMcpTool[] {
  if (allowSpend) {
    return ALL_TOOLS_IN_ORDER;
  }
  return ALL_TOOLS_IN_ORDER.filter((tool) => !SPEND_TOOL_NAMES.has(tool.name));
}
