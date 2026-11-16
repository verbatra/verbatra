import type { Locale } from "./i18n";
import { homePath } from "./site";

export const COMPARISON_LAST_CHECKED = "2026-11-16";

export const COMPARISON_ANCHOR = "compare";

export const COMPARISON_TOOLS = ["verbatra", "crowdin", "tolgee", "lingo", "manual"] as const;

export type ComparisonTool = (typeof COMPARISON_TOOLS)[number];

export type ComparisonVendor = Exclude<ComparisonTool, "manual">;

export const COMPARISON_VENDOR_NAMES: Readonly<Record<ComparisonVendor, string>> = {
  verbatra: "Verbatra",
  crowdin: "Crowdin",
  tolgee: "Tolgee",
  lingo: "Lingo.dev",
};

export const COMPARISON_SHORT_VENDOR_NAMES: Readonly<Partial<Record<ComparisonVendor, string>>> = {
  lingo: "Lingo",
};

export const COMPARISON_ROWS = [
  "vendorAccount",
  "ownKeys",
  "changedKeys",
  "ciGate",
  "placeholderCheck",
  "webEditor",
] as const;

export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

export const COMPARISON_VERDICTS = ["yes", "partial", "no"] as const;

export type ComparisonVerdict = (typeof COMPARISON_VERDICTS)[number];

export type ComparisonCell = {
  readonly verdict: ComparisonVerdict;
  readonly sources: ReadonlyArray<string>;
};

const REPO = "https://github.com/verbatra/verbatra/blob/main";

function cell(verdict: ComparisonVerdict, ...sources: ReadonlyArray<string>): ComparisonCell {
  return { verdict, sources };
}

const MANUAL_YES = cell("yes");
const MANUAL_NO = cell("no");

const GRID: Readonly<Record<ComparisonRow, Readonly<Record<ComparisonTool, ComparisonCell>>>> = {
  vendorAccount: {
    verbatra: cell(
      "yes",
      `${REPO}/packages/sdk/src/config/provider-config.ts`,
      `${REPO}/packages/ai-providers/src/env.ts`,
    ),
    crowdin: cell(
      "no",
      "https://crowdin.github.io/crowdin-cli/",
      "https://github.com/crowdin/crowdin-cli",
    ),
    tolgee: cell(
      "partial",
      "https://docs.tolgee.io/tolgee-cli/usage",
      "https://docs.tolgee.io/platform/self_hosting/licensing",
    ),
    lingo: cell("no", "https://lingo.dev/en/docs/cli"),
    manual: MANUAL_YES,
  },
  ownKeys: {
    verbatra: cell("yes", `${REPO}/packages/ai-providers/src/env.ts`),
    crowdin: cell(
      "yes",
      "https://support.crowdin.com/crowdin-ai/",
      "https://support.crowdin.com/machine-translation/",
    ),
    tolgee: cell(
      "partial",
      "https://docs.tolgee.io/platform/projects_and_organizations/llm-providers",
      "https://docs.tolgee.io/platform/translation_process/machine_translation",
    ),
    lingo: cell(
      "partial",
      "https://lingo.dev/pricing",
      "https://lingo.dev/en/docs/platform/llm-models",
    ),
    manual: MANUAL_YES,
  },
  changedKeys: {
    verbatra: cell("yes", `${REPO}/packages/sdk/src/flow/locale-run.ts`),
    crowdin: cell("partial", "https://support.crowdin.com/pre-translation/"),
    tolgee: cell(
      "partial",
      "https://docs.tolgee.io/platform/projects_and_organizations/machine-translation-settings",
    ),
    lingo: cell("yes", "https://lingo.dev/en/docs/cli/ci"),
    manual: MANUAL_NO,
  },
  ciGate: {
    verbatra: cell("yes", `${REPO}/packages/cli/src/run.ts`),
    crowdin: cell("yes", "https://crowdin.github.io/crowdin-cli/commands/crowdin-status"),
    tolgee: cell(
      "no",
      "https://github.com/tolgee/tolgee-cli/tree/main/src/commands",
      "https://raw.githubusercontent.com/tolgee/tolgee-cli/main/src/commands/sync/compare.ts",
    ),
    lingo: cell("yes", "https://lingo.dev/en/docs/cli/ci"),
    manual: MANUAL_NO,
  },
  placeholderCheck: {
    verbatra: cell(
      "yes",
      `${REPO}/packages/core/src/placeholder/integrity.ts`,
      `${REPO}/packages/sdk/src/flow/integrity-gate.ts`,
    ),
    crowdin: cell("yes", "https://support.crowdin.com/project-settings/qa-checks/"),
    tolgee: cell("yes", "https://docs.tolgee.io/platform/translation_process/qa_checks"),
    lingo: cell("partial", "https://lingo.dev/en/docs/platform/ai-reviewers"),
    manual: MANUAL_NO,
  },
  webEditor: {
    verbatra: cell("partial", `${REPO}/packages/studio/src/server/create-studio-server.ts`),
    crowdin: cell("yes", "https://support.crowdin.com/online-editor/"),
    tolgee: cell("yes", "https://docs.tolgee.io/platform/"),
    lingo: cell("partial", "https://lingo.dev/en/docs/api/pipeline/human-review"),
    manual: MANUAL_NO,
  },
};

export function comparisonCell(row: ComparisonRow, tool: ComparisonTool): ComparisonCell {
  return GRID[row][tool];
}

export function comparisonHref(locale: Locale): string {
  return `${homePath(locale)}#${COMPARISON_ANCHOR}`;
}
