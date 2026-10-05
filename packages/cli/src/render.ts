import { isAbsolute, relative, sep } from "node:path";
import process from "node:process";
import {
  type BudgetStanding,
  budgetStanding,
  type CheckFileSummary,
  type CheckSummary,
  type DiffSummary,
  type DoctorCheckStatus,
  type DoctorResult,
  type EstimateCaveatCode,
  type ExportTmxResult,
  type ExportWorkbookResult,
  type ExtractResult,
  errorHint,
  type FuzzyCacheHit,
  type GenerateTypesResult,
  type ImportTmxResult,
  INTEGRITY_GATE_REASONS,
  type IncompletePlural,
  type InconsistencyGroup,
  type IntegrityRefusal,
  type LiteralScan,
  type LocaleCapability,
  type LocaleCapabilityReport,
  type LocaleCapabilityWarning,
  type LocaleCheckSummary,
  type LocaleDiff,
  type LocaleFileCheck,
  type LocaleFinishedEvent,
  type LocaleQaReport,
  type LocaleSummary,
  type LockWaitEvent,
  PROVENANCE_BUCKETS,
  type ProgressEvent,
  type ProtectedKey,
  type ProvenanceBucket,
  type ProvenanceMarkers,
  type ProvenanceReportResult,
  type PseudolocalizeResult,
  projectRelativeMessage,
  type QaFinding,
  type QaSyntaxFinding,
  type RunBudget,
  type RunEstimate,
  type RunSummary,
  type SensitiveKeyFinding,
  scaffoldingMetadata,
  type TmxLanguageReport,
  type TmxRejectionReason,
  type TmxUnitRefusal,
  type UnusedKeysReport,
  type UnusedKeysScan,
  type UnusedKeysSite,
  type UnusedKeysUnreliability,
  type UsageSummary,
} from "@verbatra/sdk";
import type { CliErrorCode } from "./cli-error-codes.js";
import { CLI_ERROR_HINTS } from "./cli-error-hints.js";
import { CliUsageError } from "./cli-usage-error.js";

const FALLBACK_ERROR_CODE: CliErrorCode = "CLI_ERROR";

export interface RenderableError {
  readonly code: string;
  readonly message: string;
  readonly causeCode?: string;
  readonly candidates?: readonly string[];
  readonly missing?: readonly string[];
  readonly hint?: string;
}

function stringListOf(
  error: Error,
  field: "candidates" | "missing",
): readonly string[] | undefined {
  const list = (error as Partial<Record<typeof field, unknown>>)[field];
  return Array.isArray(list) && list.every((entry) => typeof entry === "string") ? list : undefined;
}

export function displayPath(path: string, base: string | undefined): string {
  if (base === undefined || !isAbsolute(path)) {
    return path;
  }
  const inside = relative(base, path);
  const outside =
    inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return outside ? path : inside;
}

function codeOf(value: unknown): string | undefined {
  const code = value instanceof Error ? (value as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

function hintOf(error: Error): string | undefined {
  return error instanceof CliUsageError ? CLI_ERROR_HINTS[error.code] : errorHint(error);
}

export function toRenderableError(error: unknown): RenderableError {
  if (error instanceof Error) {
    const causeCode = codeOf(error.cause);
    const candidates = stringListOf(error, "candidates");
    const missing = stringListOf(error, "missing");
    const hint = hintOf(error);
    return {
      code: codeOf(error) ?? FALLBACK_ERROR_CODE,
      message: projectRelativeMessage(error.message, process.cwd()),
      ...(causeCode === undefined ? {} : { causeCode }),
      ...(candidates === undefined ? {} : { candidates }),
      ...(missing === undefined ? {} : { missing }),
      ...(hint === undefined ? {} : { hint }),
    };
  }
  return { code: FALLBACK_ERROR_CODE, message: String(error) };
}

function runHeader(summary: RunSummary, command: string): string {
  if (summary.estimate !== undefined) {
    return `verbatra ${command} (estimate)`;
  }
  return summary.dryRun ? `verbatra ${command} (dry run)` : `verbatra ${command}`;
}

export function renderHuman(summary: RunSummary, command = "translate"): string {
  const header = runHeader(summary, command);
  const labels = runCountLabels(summary.dryRun, command);
  const localeLines = summary.locales.flatMap((locale) => renderLocaleLine(locale, labels));
  const aggregate = `${summary.succeeded.length} succeeded, ${summary.partial.length} partial, ${summary.failed.length} failed${
    summary.dryRun ? " (dry run: nothing written)" : ""
  }`;
  const usageLine = summary.usage !== undefined ? [`  total: ${renderTokens(summary.usage)}`] : [];
  const budgetLine = summary.budget !== undefined ? [renderBudgetLine(summary.budget)] : [];
  const estimateLines = summary.estimate !== undefined ? renderEstimateLines(summary.estimate) : [];
  return [header, ...localeLines, ...usageLine, ...budgetLine, ...estimateLines, aggregate].join(
    "\n",
  );
}

function renderTokens(usage: UsageSummary): string {
  return `${plural(usage.inputTokens + usage.outputTokens, "token")} (${usage.inputTokens} in, ${usage.outputTokens} out)`;
}

const BUDGET_STATUS: Record<BudgetStanding, string> = {
  within: "within budget",
  "stopped-before-ceiling": "stopped before the ceiling",
  reached: "exceeded",
};

function renderBudgetLine(budget: RunBudget): string {
  const status = BUDGET_STATUS[budgetStanding(budget)];
  const counted = `${budget.tokensUsed}/${budget.maxTokens} tokens (${budget.behavior})`;
  const line = `  budget: ${counted}, ${status}`;
  return budget.supported || budget.tokensUsed === 0
    ? line
    : `${line}, estimated (not every request reported usage)`;
}

const COST_DECIMALS = 4;
const SMALLEST_PRINTABLE_COST = 0.00005;
const SMALLEST_PRINTED_COST = "0.0001";

function renderCostFigure(cost: number, currency: string): string {
  return cost > 0 && cost < SMALLEST_PRINTABLE_COST
    ? `less than ${SMALLEST_PRINTED_COST} ${currency}`
    : `${cost.toFixed(COST_DECIMALS)} ${currency}`;
}

const CAVEAT_PHRASES: Record<EstimateCaveatCode, string> = {
  CACHE_NOT_CONSULTED: "cache hits",
  SOURCE_DUPLICATES_NOT_DEDUPLICATED: "duplicate source strings",
  TRANSPORT_RETRIES_NOT_COUNTED: "provider-side retries",
  TRANSLATION_LENGTH_IS_ESTIMATED: "translation length",
  TOKEN_COUNT_IS_HEURISTIC: "tokenizer differences",
  REPAIR_REQUESTS_NOT_COUNTED: "repair requests",
};

function renderEstimateScale(estimate: RunEstimate): string {
  switch (estimate.unit) {
    case "tokens":
      return `~${estimate.inputTokens} input + ~${estimate.outputTokens} output tokens`;
    case "characters":
      return `~${estimate.sourceCharacters} source characters`;
  }
}

function renderEstimateQuantity(estimate: RunEstimate): string {
  const scale = renderEstimateScale(estimate);
  return `  estimate: ${plural(estimate.keys, "key")} in ${plural(estimate.requests, "request")}, ${scale}`;
}

function renderNotBilled(estimate: RunEstimate): string {
  return estimate.provider === scaffoldingMetadata.humanOnlyProviderId
    ? "  estimated spend: none, machine translation is disabled by policy"
    : `  estimated spend: no API cost, ${estimate.rateKey} is self-hosted`;
}

function renderEstimateCost(estimate: RunEstimate): string {
  switch (estimate.pricing) {
    case "priced":
      return (
        `  estimated spend: ${renderCostFigure(estimate.cost, estimate.currency)} ` +
        `at rates as of ${estimate.asOf} (a planning estimate, not a quotation)`
      );
    case "no-rate-on-file":
      return (
        `  estimated spend: no rate on file for ${estimate.rateKey}; ` +
        `add rates.table["${estimate.rateKey}"] to your config to see a currency figure`
      );
    case "rate-unit-mismatch":
      return (
        `  estimated spend: the rate on file for ${estimate.rateKey} is not priced in ` +
        `${estimate.unit}; correct rates.table["${estimate.rateKey}"] in your config`
      );
    case "not-billed":
      return renderNotBilled(estimate);
  }
}

function renderEstimateCaveats(estimate: RunEstimate): string {
  const phrases = estimate.caveats.map((code) => CAVEAT_PHRASES[code]);
  return `  estimate excludes: ${phrases.join(", ")}`;
}

function renderEstimateLines(estimate: RunEstimate): readonly string[] {
  return [
    renderEstimateQuantity(estimate),
    renderEstimateCost(estimate),
    renderEstimateCaveats(estimate),
  ];
}

const DETAIL_GROUP_WIDTH = 17;

function renderDetailGroup(label: string, values: readonly string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return `    ${`${label}:`.padEnd(DETAIL_GROUP_WIDTH - 1)} ${values.join(", ")}`;
}

const FUZZY_SOURCE_PREVIEW = 40;

function neutralizeControlCharacters(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ");
}

function preview(text: string, cap: number): string {
  const characters = Array.from(neutralizeControlCharacters(text));
  return characters.length <= cap ? characters.join("") : `${characters.slice(0, cap).join("")}...`;
}

function previewSource(source: string): string {
  return preview(source, FUZZY_SOURCE_PREVIEW);
}

function renderFuzzyHit(hit: FuzzyCacheHit): string {
  const percent = Math.round(hit.similarity * 100);
  return `${hit.key} (${percent}% like "${previewSource(hit.previousSource)}")`;
}

function renderSuggestion(entry: ProtectedKey): string {
  if (entry.suggestion !== undefined) {
    return `, suggestion "${preview(entry.suggestion, FUZZY_SOURCE_PREVIEW)}"`;
  }
  return entry.suggestionStatus === undefined ? "" : `, suggestion ${entry.suggestionStatus}`;
}

function renderProtectedKey(entry: ProtectedKey): string {
  return `${entry.key} (${entry.reason}${renderSuggestion(entry)})`;
}

function renderPosition(at: { readonly row: number; readonly line?: number }): string {
  return at.line === undefined ? `row ${at.row}` : `row ${at.row}, line ${at.line}`;
}

const REFUSAL_DETAIL_PREVIEW = 120;

function renderRefusalDetails(details: readonly string[] | undefined): string {
  return details === undefined
    ? ""
    : ` (${details.map((detail) => preview(detail, REFUSAL_DETAIL_PREVIEW)).join(", ")})`;
}

function renderRefusal(refusal: IntegrityRefusal): string {
  return `      ${neutralizeControlCharacters(refusal.key)}: ${refusal.reason}${renderRefusalDetails(refusal.details)}`;
}

function renderIntegrityWithheld(
  locale: LocaleSummary,
  unrefusedReason: string | undefined,
): readonly string[] {
  const refusals = locale.integrityRefusals;
  if (refusals === undefined) {
    const keys = renderDetailGroup("integrity-withheld", locale.integrityMismatches);
    return keys === undefined ? [] : [keys];
  }
  const refused = new Set(refusals.map((refusal) => refusal.key));
  const lines = [
    ...refusals.map((refusal) => ({ key: refusal.key, line: renderRefusal(refusal) })),
    ...locale.integrityMismatches
      .filter((key) => !refused.has(key))
      .map((key) => ({
        key,
        line: `      ${neutralizeControlCharacters(key)}${unrefusedReason === undefined ? "" : `: ${unrefusedReason}`}`,
      })),
  ].sort((left, right) => (left.key < right.key ? -1 : 1));
  return lines.length === 0 ? [] : ["    integrity-withheld:", ...lines.map((entry) => entry.line)];
}

function renderNotices(notices: LocaleSummary["notices"]): readonly string[] {
  return notices.length === 0
    ? []
    : ["    notices:", ...notices.map((notice) => `      [${notice.code}] ${notice.message}`)];
}

function renderLocaleDetail(locale: LocaleSummary, labels: RunCountLabels): readonly string[] {
  const groups = [
    renderDetailGroup("fuzzy-reused", locale.fuzzyHits.map(renderFuzzyHit)),
    renderDetailGroup("provider-failed", locale.providerFailures),
    renderDetailGroup("sensitive-withheld", locale.sensitiveWithheld),
    ...renderNotices(locale.notices),
    renderDetailGroup("unfilled", locale.unfilled),
    renderDetailGroup("protected", locale.protected.map(renderProtectedKey)),
    renderDetailGroup(
      "malformed",
      locale.malformedRows.map((problem) => `${renderPosition(problem)} (${problem.column})`),
    ),
    renderDetailGroup(
      "duplicates",
      locale.duplicateKeys.map((duplicate) => `${duplicate.key} (${renderPosition(duplicate)})`),
    ),
  ].filter((line): line is string => line !== undefined);
  return [...renderIntegrityWithheld(locale, labels.unrefusedReason), ...groups];
}

interface RunCountLabels {
  readonly translated: string;
  readonly pruned: string;
  readonly unrefusedReason?: string;
}

const DRY_RUN_TRANSLATED_LABELS: Readonly<Record<string, string>> = { import: "would import" };

const UNREFUSED_REASONS: Readonly<Record<string, string>> = {
  import: "source changed since export",
};

function runCountLabels(dryRun: boolean, command: string): RunCountLabels {
  const unrefused = UNREFUSED_REASONS[command];
  const reason = unrefused === undefined ? {} : { unrefusedReason: unrefused };
  if (!dryRun) {
    return { translated: "translated", pruned: "pruned", ...reason };
  }
  return {
    translated: DRY_RUN_TRANSLATED_LABELS[command] ?? "would translate",
    pruned: "would prune",
    ...reason,
  };
}

function renderLocaleLine(locale: LocaleSummary, labels: RunCountLabels): readonly string[] {
  if (locale.status === "failed" && locale.error !== undefined) {
    const suffix = ` [${locale.error.code}] ${locale.error.message}`;
    return [`  ${locale.locale}: failed${suffix}`, ...renderLocaleDetail(locale, labels)];
  }
  const counts: ReadonlyArray<readonly [number, string, boolean, string?]> = [
    [locale.translated.length, labels.translated, true],
    [locale.cacheHits.length, "from cache", false],
    [locale.fuzzyHits.length, "fuzzy-reused", false],
    [locale.unchanged.length, "unchanged", true],
    [locale.generated.length, "generated", false],
    [locale.orphaned.length, "orphaned", false],
    [locale.pruned.length, labels.pruned, false],
    [locale.invalidIcuSource.length, "invalid-ICU skipped", false],
    [locale.integrityMismatches.length, "integrity-withheld", false],
    [locale.providerFailures.length, "provider-failed", false],
    [locale.budgetWithheld.length, "budget-withheld", false],
    [locale.sensitiveWithheld.length, "sensitive-withheld", false],
    [locale.unfilled.length, "unfilled", false],
    [locale.protected.length, "protected", false],
    [locale.malformedRows.length, "malformed-row", false, "malformed-rows"],
    [locale.duplicateKeys.length, "duplicate-key", false, "duplicate-keys"],
    [locale.needsReview.length, "needs-review", false],
    [locale.notices.length, "notice", false, "notices"],
  ];
  const shown = counts
    .filter(([count, , always]) => always || count > 0)
    .map(([count, label, , pluralLabel]) => plural(count, label, pluralLabel ?? label));
  const tokenSuffix = locale.usage !== undefined ? `, ${renderTokens(locale.usage)}` : "";
  const status = locale.status === "failed" ? "failed, " : "";
  return [
    `  ${locale.locale}: ${status}${shown.join(", ")}${tokenSuffix}`,
    ...renderLocaleDetail(locale, labels),
  ];
}

function unavailableMarkersLine(
  markers: ProvenanceMarkers | undefined,
  unreadable: string,
): readonly string[] {
  return markers === "unavailable"
    ? [`  no machine-translation markers written: ${unreadable} could not be read`]
    : [];
}

export function renderExportHuman(result: ExportWorkbookResult, base?: string): string {
  const localeLines = result.locales.map((l) => `  ${l.locale}: ${plural(l.rows, "row")}`);
  const total = result.locales.reduce((sum, l) => sum + l.rows, 0);
  return [
    `verbatra export -> ${displayPath(result.path, base)}`,
    ...localeLines,
    `${plural(total, "row")} across ${plural(result.locales.length, "locale")}`,
    ...unavailableMarkersLine(result.provenanceMarkers, "verbatra.provenance.json"),
  ].join("\n");
}

function renderProtectedCount(count: number | undefined): string {
  return count === undefined || count === 0 ? "" : ` (${count} protected)`;
}

function outOfSyncLine(summary: CheckSummary, machineTranslation: boolean): string {
  if (!machineTranslation) {
    return "out of sync (machine translation is disabled: hand the keys to a translator with verbatra export, or edit them in verbatra studio)";
  }
  const everyStaleKeyProtected =
    summary.locales.some((locale) => locale.stale > 0) &&
    summary.locales.every(
      (locale) => locale.missing === 0 && locale.stale === (locale.protected ?? 0),
    );
  return everyStaleKeyProtected
    ? "out of sync (every stale key is protected from machine writes: review or edit it in verbatra studio)"
    : "out of sync (run verbatra translate to update)";
}

function renderEmptySourceCount(summary: CheckSummary): readonly string[] {
  const count = Math.max(0, ...summary.locales.map((locale) => locale.emptySource ?? 0));
  if (count === 0) {
    return [];
  }
  return [
    count === 1
      ? "1 source key has an empty value and is not counted: write its source text to translate it"
      : `${count} source keys have an empty value and are not counted: write their source text to translate them`,
  ];
}

export function renderCheckHuman(summary: CheckSummary, machineTranslation = true): string {
  const localeLines = summary.locales.map(
    (l) =>
      `  ${l.locale}: ${l.missing} missing, ${l.stale} stale${renderProtectedCount(l.protected)}, ${l.upToDate} up-to-date (${
        l.inSync ? "in sync" : "out of sync"
      })`,
  );
  const overall = summary.inSync
    ? "all locales in sync"
    : outOfSyncLine(summary, machineTranslation);
  return [
    "verbatra check",
    ...localeLines,
    overall,
    ...renderEmptySourceCount(summary),
    ...renderIncompletePlurals(summary, "--qa --strict"),
    ...renderConsistencyReport(summary),
    ...renderQaReport(summary),
    ...renderReviewReport(summary),
    ...renderSensitiveReport(summary),
  ].join("\n");
}

function renderSensitiveFinding(finding: SensitiveKeyFinding): string {
  return `  ${neutralizeControlCharacters(finding.key)}: ${finding.detectors.join(", ")} in ${finding.fields.join(", ")}`;
}

function renderSensitiveReport(summary: CheckSummary): readonly string[] {
  const sensitive = summary.sensitive;
  if (sensitive === undefined) {
    return [];
  }
  const count = sensitive.findings.length + sensitive.glossaryTerms;
  if (count === 0) {
    return ["sensitive: nothing found"];
  }
  return [
    `sensitive: ${plural(sensitive.findings.length, "key")} and ${plural(sensitive.glossaryTerms, "glossary term")} hold content that looks sensitive`,
    ...sensitive.findings.map(renderSensitiveFinding),
    "  remove it, list it in sensitiveData.allow, or turn the detector off in sensitiveData.detectors",
  ];
}

const LISTED_UNREVIEWED_KEYS = 10;

function renderUnreviewedKeys(keys: readonly string[]): string {
  const listed = keys.slice(0, LISTED_UNREVIEWED_KEYS).map(neutralizeControlCharacters).join(", ");
  const rest = keys.length - LISTED_UNREVIEWED_KEYS;
  return rest > 0 ? `${listed}, and ${rest} more` : listed;
}

function renderReviewReport(summary: CheckSummary): readonly string[] {
  const review = summary.review;
  if (review === undefined) {
    return [];
  }
  if (review.code === "REVIEW_STATE_UNREADABLE") {
    return [
      "review: failed [REVIEW_STATE_UNREADABLE] verbatra.provenance.json is corrupt or from a newer verbatra, so no review state can be read",
    ];
  }
  if (review.reviewed) {
    return ["review: every machine-written translation is approved"];
  }
  return [
    `review: failed [REVIEW_REQUIRED] ${plural(review.unreviewed, "machine-written translation")} not approved`,
    ...summary.locales.flatMap((locale) =>
      locale.review === undefined || locale.review.unreviewed.length === 0
        ? []
        : [
            `  ${locale.locale}: ${locale.review.unreviewed.length} unreviewed: ${renderUnreviewedKeys(locale.review.unreviewed)}`,
          ],
    ),
    "  approve or reject them in verbatra studio's Review queue, then commit verbatra.provenance.json",
  ];
}

function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

function renderFindingReason(finding: QaFinding): string {
  const details =
    finding.details !== undefined
      ? ` (${finding.details.map(neutralizeControlCharacters).join(", ")})`
      : "";
  return `${finding.reason}${details}`;
}

function renderKeyFindings(findings: readonly QaFinding[]): readonly string[] {
  const byKey = new Map<string, QaFinding[]>();
  for (const finding of findings) {
    const group = byKey.get(finding.key) ?? [];
    group.push(finding);
    byKey.set(finding.key, group);
  }
  return [...byKey].map(([key, group]) => {
    const severity = group.some((finding) => finding.severity === "error") ? "error" : "warning";
    return `    ${neutralizeControlCharacters(key)}: ${severity} ${group.map(renderFindingReason).join(", ")}`;
  });
}

function renderLocaleQa(locale: string, report: LocaleQaReport): readonly string[] {
  const checked = plural(report.checked, "value");
  if (report.findings.length === 0) {
    return [`  ${locale}: clean, ${checked} checked`];
  }
  return [
    `  ${locale}: ${plural(report.errors, "error")}, ${plural(report.warnings, "warning")} in ${checked} checked`,
    ...renderKeyFindings(report.findings),
  ];
}

function renderSkippedSourceKeys(invalidSourceKeys: readonly string[]): readonly string[] {
  return invalidSourceKeys.length > 0
    ? [
        `  skipped, source is not valid ICU: ${invalidSourceKeys.map(neutralizeControlCharacters).join(", ")}`,
      ]
    : [];
}

function renderQaReport(summary: CheckSummary): readonly string[] {
  const totals = summary.qa;
  if (totals === undefined) {
    return [];
  }
  const skipped = renderSkippedSourceKeys(totals.invalidSourceKeys);
  return [
    `qa: ${plural(totals.errors, "error")}, ${plural(totals.warnings, "warning")}`,
    ...summary.locales.flatMap((locale) =>
      locale.qa === undefined ? [] : renderLocaleQa(locale.locale, locale.qa),
    ),
    ...skipped,
  ];
}

function renderSyntaxFinding(locale: string, finding: QaSyntaxFinding): string {
  return `  ${locale}: syntax error [${finding.code}] ${neutralizeControlCharacters(finding.message)}`;
}

function renderLocaleFileCheck(entry: LocaleFileCheck): readonly string[] {
  const syntax = entry.qa.findings.find(
    (finding): finding is QaSyntaxFinding => finding.reason === "syntax",
  );
  if (syntax !== undefined) {
    return [renderSyntaxFinding(entry.locale, syntax)];
  }
  const findings = entry.qa.findings.filter(
    (finding): finding is QaFinding => finding.reason !== "syntax",
  );
  return renderLocaleQa(entry.locale, { ...entry.qa, findings });
}

export function renderCheckFileHuman(summary: CheckFileSummary): string {
  return [
    `verbatra check --file ${neutralizeControlCharacters(summary.file)} (${summary.role})`,
    `qa: ${plural(summary.qa.errors, "error")}, ${plural(summary.qa.warnings, "warning")}`,
    ...summary.locales.flatMap(renderLocaleFileCheck),
    ...renderSkippedSourceKeys(summary.qa.invalidSourceKeys),
    ...renderIncompletePlurals(summary, "--strict"),
  ].join("\n");
}

function describePluralKind(gap: IncompletePlural): string {
  if (gap.argument !== undefined) {
    const kind = gap.ruleType === "ordinal" ? "selectordinal" : "plural";
    return ` {${neutralizeControlCharacters(gap.argument)}} ${kind}`;
  }
  return gap.ruleType === "ordinal" ? " (ordinal)" : "";
}

function renderIncompletePlural(gap: IncompletePlural): string {
  return `    ${neutralizeControlCharacters(gap.key)}${describePluralKind(gap)}: missing ${gap.missing.join(", ")}`;
}

interface PluralReportingLocale {
  readonly locale: string;
  readonly incompletePlurals?: readonly IncompletePlural[] | undefined;
}

function renderIncompletePlurals(
  summary: { readonly locales: readonly PluralReportingLocale[] },
  strictFlags: string,
): readonly string[] {
  const affected = summary.locales.flatMap((locale) =>
    locale.incompletePlurals !== undefined && locale.incompletePlurals.length > 0
      ? [{ locale: locale.locale, gaps: locale.incompletePlurals }]
      : [],
  );
  if (affected.length === 0) {
    return [];
  }
  return [
    `plural categories (warning: exit 1 only under ${strictFlags})`,
    ...affected.flatMap(({ locale, gaps }) => [
      `  ${locale}: ${plural(gaps.length, "plural")} missing CLDR categories`,
      ...gaps.map(renderIncompletePlural),
    ]),
  ];
}

function quoted(text: string): string {
  return `"${neutralizeControlCharacters(text)}"`;
}

function renderPluralQualifier(group: InconsistencyGroup): string | undefined {
  if (!group.isPlural) {
    return undefined;
  }
  return group.pluralForm === undefined ? "plural" : `plural form ${quoted(group.pluralForm)}`;
}

function renderGroupQualifiers(group: InconsistencyGroup): string {
  const qualifiers = [
    group.context !== undefined ? `context ${quoted(group.context)}` : undefined,
    group.description !== undefined ? `description ${quoted(group.description)}` : undefined,
    group.meaning !== undefined ? `meaning ${quoted(group.meaning)}` : undefined,
    renderPluralQualifier(group),
  ].filter((qualifier) => qualifier !== undefined);
  return qualifiers.length === 0 ? "" : ` (${qualifiers.join(", ")})`;
}

function renderInconsistencyGroup(group: InconsistencyGroup): readonly string[] {
  return [
    `    ${quoted(group.source)}${renderGroupQualifiers(group)} is translated ${group.translations.length} ways:`,
    ...group.translations.map(
      (translation) =>
        `      ${quoted(translation.value)}: ${translation.keys.map(neutralizeControlCharacters).join(", ")}`,
    ),
  ];
}

function renderLocaleConsistency(
  locale: string,
  groups: readonly InconsistencyGroup[],
): readonly string[] {
  if (groups.length === 0) {
    return [`  ${locale}: consistent`];
  }
  const noun = groups.length === 1 ? "source string" : "source strings";
  return [
    `  ${locale}: ${groups.length} ${noun} translated more than one way`,
    ...groups.flatMap(renderInconsistencyGroup),
  ];
}

function renderConsistencyReport(summary: CheckSummary): readonly string[] {
  const reported = summary.locales.filter(
    (locale): locale is LocaleCheckSummary & { inconsistencies: readonly InconsistencyGroup[] } =>
      locale.inconsistencies !== undefined,
  );
  if (reported.length === 0) {
    return [];
  }
  return [
    "consistency (report only, never changes the exit code)",
    ...reported.flatMap((locale) => renderLocaleConsistency(locale.locale, locale.inconsistencies)),
  ];
}

const DOCTOR_STATUS_LABELS: Record<DoctorCheckStatus, string> = {
  pass: "ok  ",
  warn: "warn",
  fail: "fail",
  skipped: "skip",
};

function renderLiteralLines(scan: LiteralScan | undefined): readonly string[] {
  if (scan === undefined) {
    return [];
  }
  return [
    ...scan.findings.map(
      (finding) => `    ${finding.file}:${finding.line}:${finding.column}  ${quoted(finding.text)}`,
    ),
    ...scan.suppressed.map(
      (entry) =>
        `    suppressed (${entry.reason}) ${entry.file}:${entry.line}:${entry.column}  ${quoted(entry.text)}`,
    ),
    ...scan.diagnostics.map(
      (diagnostic) => `    not scanned (${diagnostic.reason}) ${diagnostic.file}`,
    ),
  ];
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function renderCapabilityWarnings(warnings: readonly LocaleCapabilityWarning[]): readonly string[] {
  return warnings.map((warning) => `      warning [${warning.code}] ${warning.message}`);
}

function renderTargetCapability(entry: LocaleCapability): readonly string[] {
  return [
    `    ${entry.locale}  sent as ${entry.providerCode}${entry.mapped ? " (localeMap)" : ""}  ` +
      `${entry.support}  glossary: ${yesNo(entry.glossary)}  formality: ${yesNo(entry.formality)}`,
    ...renderCapabilityWarnings(entry.warnings),
  ];
}

function renderLocaleCapabilities(report: LocaleCapabilityReport | undefined): readonly string[] {
  if (report === undefined) {
    return [];
  }
  const table =
    report.coverage === "open"
      ? `accepts any locale, well-tested list of ${report.tableVersion}`
      : `language table of ${report.tableVersion}, ${report.tableOrigin}`;
  const { source } = report;
  return [
    `  locale support (${report.provider}, ${table})`,
    ...(report.live === undefined
      ? []
      : [`    live language list ${report.live.status}: ${report.live.detail}`]),
    `    ${source.locale}  sent as ${source.providerCode}${source.mapped ? " (localeMap)" : ""}  ` +
      `source, ${source.support}`,
    ...renderCapabilityWarnings(source.warnings),
    ...report.locales.flatMap(renderTargetCapability),
  ];
}

export interface DoctorRenderOptions {
  readonly locales?: boolean;
  readonly paintStatus?: (status: DoctorCheckStatus, label: string) => string;
}

export function renderDoctorHuman(result: DoctorResult, options: DoctorRenderOptions = {}): string {
  const paint = options.paintStatus ?? ((_status: DoctorCheckStatus, label: string) => label);
  const lines = result.checks.flatMap((entry) => [
    `  ${paint(entry.status, `[${DOCTOR_STATUS_LABELS[entry.status]}]`)} ${entry.title}: ${entry.detail}`,
    ...(entry.fix === undefined ? [] : [`         fix: ${entry.fix}`]),
  ]);
  const failed = result.checks.filter((entry) => entry.status === "fail").length;
  const warned = result.checks.filter((entry) => entry.status === "warn").length;
  const trailer = result.ok
    ? `no problems found${warned === 0 ? "" : `, ${plural(warned, "warning")}`}`
    : failed === 1
      ? "1 problem found (run verbatra doctor again after fixing it)"
      : `${failed} problems found (run verbatra doctor again after fixing them)`;
  return [
    "verbatra doctor",
    ...lines,
    ...renderLiteralLines(result.literals),
    ...(options.locales === true ? renderLocaleCapabilities(result.locales) : []),
    trailer,
  ].join("\n");
}

const DIFF_GROUP_WIDTH = 14;

function renderDiffGroup(label: string, keys: readonly string[]): string | undefined {
  if (keys.length === 0) {
    return undefined;
  }
  return `    ${`${label}:`.padEnd(DIFF_GROUP_WIDTH)}${keys.join(", ")}`;
}

function renderDiffLocale(locale: LocaleDiff): readonly string[] {
  const total = locale.missing.length + locale.changed.length + locale.orphaned.length;
  const emptySource = renderDiffGroup("empty source", locale.emptySource ?? []);
  if (total === 0) {
    return [
      `  ${locale.locale}: no pending changes`,
      ...(emptySource === undefined ? [] : [emptySource]),
    ];
  }
  const header = `  ${locale.locale}: ${locale.missing.length} to add, ${locale.changed.length} to re-translate, ${locale.orphaned.length} orphaned`;
  const groups = [
    renderDiffGroup("add", locale.missing),
    renderDiffGroup("re-translate", locale.changed),
    renderDiffGroup("orphaned", locale.orphaned),
    renderDiffGroup("protected", locale.protected ?? []),
    emptySource,
  ].filter((line): line is string => line !== undefined);
  return [header, ...groups];
}

function renderUnusedSite(site: UnusedKeysSite): string {
  const file = neutralizeControlCharacters(site.file);
  const location = site.line === undefined ? file : `${file}:${site.line}`;
  return site.detail === undefined
    ? location
    : `${location}  ${neutralizeControlCharacters(site.detail)}`;
}

function renderUnreliability(entry: UnusedKeysUnreliability): readonly string[] {
  const shown = entry.sites.slice(0, EXTRACT_LIST_LIMIT);
  const rest = entry.count - shown.length;
  return [
    `    ${entry.reason} (${entry.count}):`,
    ...shown.map((site) => `      ${renderUnusedSite(site)}`),
    ...(rest > 0 ? [`      and ${rest} more`] : []),
  ];
}

function renderUnusedScan(report: UnusedKeysScan): readonly string[] {
  const header =
    `  unused source keys: ${report.status}, ${report.unused.length} unused, ` +
    `${report.possiblyDynamic.length} possibly dynamic, ${report.ignored.length} ignored, ` +
    `${plural(report.scannedFiles, "file")} scanned`;
  const verdict =
    report.status === "complete"
      ? []
      : [
          "  unreliable: a key listed as unused may still be in use",
          ...report.unreliableBecause.flatMap(renderUnreliability),
        ];
  const unlimited = Number.POSITIVE_INFINITY;
  return [
    header,
    ...verdict,
    ...renderExtractList(
      "unused",
      report.unused.map((entry) => neutralizeControlCharacters(entry.key)),
      unlimited,
    ),
    ...renderExtractList(
      "possibly dynamic",
      report.possiblyDynamic.map(
        (entry) =>
          `${neutralizeControlCharacters(entry.key)}  (prefix ${neutralizeControlCharacters(entry.prefix)})`,
      ),
      unlimited,
    ),
    ...renderExtractList(
      "ignored",
      report.ignored.map((entry) => neutralizeControlCharacters(entry.key)),
      unlimited,
    ),
  ];
}

function renderUnusedReport(report: UnusedKeysReport | undefined): readonly string[] {
  if (report === undefined) {
    return [];
  }
  if (report.status === "not-run") {
    return [
      `  unused source keys: not run [${report.reason}] ${neutralizeControlCharacters(report.message)}`,
    ];
  }
  return renderUnusedScan(report);
}

export function renderDiffHuman(summary: DiffSummary): string {
  const localeLines = summary.locales.flatMap(renderDiffLocale);
  const count = summary.locales.length;
  const trailer = `${count} ${count === 1 ? "locale" : "locales"}, ${
    summary.hasPendingChanges ? "pending changes" : "no pending changes"
  }`;
  return ["verbatra diff", ...localeLines, ...renderUnusedReport(summary.unused), trailer].join(
    "\n",
  );
}

function renderLockHolder(event: LockWaitEvent): string {
  const holder = event.holder;
  if (holder?.pid === undefined && holder?.acquiredAt === undefined) {
    return "";
  }
  const pid = holder.pid !== undefined ? ` by pid ${holder.pid}` : "";
  const since = holder.acquiredAt !== undefined ? ` since ${holder.acquiredAt}` : "";
  return ` (held${pid}${since})`;
}

export type InterruptSignal = "SIGINT" | "SIGTERM";

export function renderInterrupted(signal: InterruptSignal, json: boolean): string {
  return json
    ? JSON.stringify({ type: "interrupted", signal, locksReleased: true })
    : `verbatra: interrupted (${signal}), released locks`;
}

export function renderLockWaitHuman(event: LockWaitEvent): string {
  const waitedSeconds = Math.round(event.elapsedMs / 1000);
  return (
    `verbatra: waiting for the write lock at ${event.lockPath}${renderLockHolder(event)}; ` +
    `waited ${waitedSeconds}s. If no verbatra process is running, this lock is orphaned and can be deleted.`
  );
}

export function renderLockWaitJson(event: LockWaitEvent): string {
  return JSON.stringify({ type: "lock-wait", ...event });
}

export function renderLockWait(event: LockWaitEvent, json: boolean): string {
  return json ? renderLockWaitJson(event) : renderLockWaitHuman(event);
}

const LOCALE_FINISHED_VERBS: Record<LocaleFinishedEvent["status"], string> = {
  succeeded: "done",
  partial: "partly done",
  failed: "failed",
};

function renderLocaleFinished(event: LocaleFinishedEvent, dryRun: boolean): string {
  const verb = LOCALE_FINISHED_VERBS[event.status];
  if (event.status === "failed" || (event.status === "partial" && event.translated === 0)) {
    return `verbatra: ${event.locale} ${verb}`;
  }
  return `verbatra: ${event.locale} ${verb}, ${event.translated} ${dryRun ? "would translate" : "translated"}`;
}

export function renderProgressHuman(event: ProgressEvent, dryRun = false): string | undefined {
  switch (event.type) {
    case "locale-started":
      return `verbatra: translating ${event.locale}`;
    case "sub-batch":
      return `verbatra: ${event.locale} batch ${event.batchIndex}/${event.totalBatches}`;
    case "locale-finished":
      return renderLocaleFinished(event, dryRun);
    case "run-finished":
      return `verbatra: run finished, ${plural(event.localesCompleted, "locale")} processed${
        event.localesFailed > 0 ? `, ${event.localesFailed} failed` : ""
      }`;
    default:
      return undefined;
  }
}

const JSON_PROGRESS_TYPES: ReadonlySet<ProgressEvent["type"]> = new Set([
  "locale-started",
  "sub-batch",
  "locale-finished",
  "run-finished",
]);

export function renderProgressJson(event: ProgressEvent): string | undefined {
  return JSON_PROGRESS_TYPES.has(event.type) ? JSON.stringify(event) : undefined;
}

export function renderError(error: RenderableError): string {
  const cause = error.causeCode === undefined ? "" : ` (cause: ${error.causeCode})`;
  return `verbatra: error [${error.code}] ${error.message}${cause}`;
}

export function renderPseudoHuman(result: PseudolocalizeResult, base?: string): string {
  const lines = [
    "verbatra pseudo",
    `  ${result.locale}: ${result.transformed} of ${plural(result.entries, "entry", "entries")} pseudolocalized`,
  ];
  if (result.copied.length > 0) {
    lines.push(`    copied verbatim: ${result.copied.join(", ")}`);
  }
  lines.push(`  ${result.written ? "wrote" : "unchanged"} ${displayPath(result.path, base)}`);
  return lines.join("\n");
}

const EXTRACT_LIST_LIMIT = 10;

function renderExtractList(
  label: string,
  lines: readonly string[],
  limit = EXTRACT_LIST_LIMIT,
): readonly string[] {
  if (lines.length === 0) {
    return [];
  }
  const shown = lines.slice(0, limit);
  const rest = lines.length - shown.length;
  const trailer = rest > 0 ? [`    and ${rest} more`] : [];
  return [`  ${label} (${lines.length}):`, ...shown.map((line) => `    ${line}`), ...trailer];
}

function renderExtractOutcome(result: ExtractResult): string {
  if (result.added.length === 0) {
    return `  no new keys found in ${result.sourcePath}`;
  }
  const verb = result.dryRun ? "would add" : "added";
  return `  ${verb} ${plural(result.added.length, "key")} to ${result.sourcePath}`;
}

export function renderExtractHuman(result: ExtractResult): string {
  const header = `  ${plural(result.scannedFiles, "file")} scanned, ${plural(result.existingKeys, "key")} already present`;
  const lines = [
    header,
    renderExtractOutcome(result),
    ...renderExtractList(
      "new keys",
      result.added.map((entry) => `${entry.key}  ${entry.file}:${entry.line}`),
    ),
    ...renderExtractList("written with an empty value", result.withoutDefault),
    ...renderExtractList(
      "dynamic keys",
      result.dynamic.map((site) => `${site.file}:${site.line}`),
    ),
    ...renderExtractList(
      "conflicting defaults",
      result.conflicts.map(
        (conflict) =>
          `${conflict.key}  ${conflict.locations.map((site) => `${site.file}:${site.line}`).join(", ")}`,
      ),
    ),
    ...renderExtractList(
      "skipped",
      result.diagnostics.map((entry) => `${entry.file}  ${entry.reason}`),
    ),
  ];
  const trailer = result.dryRun ? "dry run, nothing written" : undefined;
  return ["verbatra extract", ...lines, ...(trailer === undefined ? [] : [trailer])].join("\n");
}

function checkedTypesLine(result: GenerateTypesResult, path: string): string {
  if (result.missing) {
    return `  ${path} is missing, run verbatra types to create it`;
  }
  return result.stale
    ? `  ${path} is out of date, re-run verbatra types`
    : `  ${path} is up to date`;
}

function renderTypesOutcome(result: GenerateTypesResult, base: string | undefined): string {
  const path = displayPath(result.path, base);
  if (result.check) {
    return checkedTypesLine(result, path);
  }
  return result.written ? `  wrote ${path}` : `  unchanged ${path}`;
}

function renderTypesKeyList(label: string, keys: readonly string[]): readonly string[] {
  return keys.length === 0 ? [] : [`  ${label} (${keys.length}): ${keys.join(", ")}`];
}

export function renderTypesHuman(result: GenerateTypesResult, base?: string): string {
  const unresolved =
    result.unresolved.length === 0
      ? []
      : [
          `  arguments not determined (${result.unresolved.length}):`,
          ...result.unresolved.map((entry) => `    ${entry.key}  ${entry.reason}`),
        ];
  return [
    "verbatra types",
    `  ${plural(result.keys, "key")} declared, ${result.withArguments} of them taking arguments, from ${result.sourcePath}`,
    ...unresolved,
    ...renderTypesKeyList("excluded by the adapter", result.excluded),
    ...renderTypesKeyList("plural keys", result.plural),
    renderTypesOutcome(result, base),
  ].join("\n");
}

const LANGUAGE_TAG_PREVIEW = 20;

const TMX_REJECTION_REASONS: readonly TmxRejectionReason[] = [
  ...INTEGRITY_GATE_REASONS,
  "sourceBlank",
];

const TMX_REJECTION_LABELS: Record<TmxRejectionReason, string> = {
  placeholder: "placeholders do not match the source",
  markup: "inline markup does not match the source",
  icu: "not a valid ICU message, or its arms do not fit the target language",
  degenerate: "runaway output rather than a translation",
  empty: "blank translation of a source that has text",
  sourceBlank: "blank source segment",
};

function renderTmxRefusal(refusal: TmxUnitRefusal): string {
  return `        unit ${refusal.unit}: ${refusal.reason}${renderRefusalDetails(refusal.details)}`;
}

function renderTmxRejections(result: ImportTmxResult["locales"][number]): readonly string[] {
  const counts = TMX_REJECTION_REASONS.filter((reason) => result.rejected[reason] > 0).map(
    (reason) => `      ${result.rejected[reason]} ${TMX_REJECTION_LABELS[reason]}`,
  );
  return [...counts, ...result.refusals.map(renderTmxRefusal)];
}

function renderTmxLocale(locale: ImportTmxResult["locales"][number]): readonly string[] {
  const counts = [
    `${locale.added} added`,
    `${locale.unchanged} unchanged`,
    `${locale.kept} kept`,
    `${locale.overwritten} overwritten`,
    `${locale.duplicates} repeated in the file`,
  ].join(", ");
  const conflicts =
    locale.conflicting > 0
      ? [
          `      ${plural(locale.conflicting, "unit carried differing segments for this locale, so it was not stored", "units carried differing segments for this locale, so none of them was stored")}`,
        ]
      : [];
  return [`  ${locale.locale}: ${counts}`, ...renderTmxRejections(locale), ...conflicts];
}

function renderTmxLanguages(
  label: string,
  reports: readonly TmxLanguageReport[],
): readonly string[] {
  if (reports.length === 0) {
    return [];
  }
  const listed = reports
    .map((report) => `${preview(report.language, LANGUAGE_TAG_PREVIEW)} (${report.units})`)
    .join(", ");
  return [`  ${label}: ${listed}`];
}

function renderTmxNotes(result: ImportTmxResult): readonly string[] {
  const notes: string[] = [];
  if (result.skippedUnits > 0) {
    notes.push(
      `  ${plural(result.skippedUnits, "unit could not be read and was skipped", "units could not be read and were skipped")}`,
    );
  }
  if (result.unmatchedSourceUnits > 0) {
    notes.push(
      `  ${plural(result.unmatchedSourceUnits, "unit")} carried no segment in the source locale`,
    );
  }
  if (result.conflictingSourceUnits > 0) {
    notes.push(
      `  ${plural(
        result.conflictingSourceUnits,
        "unit carried source-locale segments of equal standing with different values, and was refused",
        "units carried source-locale segments of equal standing with different values, and were refused",
      )}`,
    );
  }
  if (result.unreachableUnits > 0) {
    notes.push(
      `  ${plural(result.unreachableUnits, "unit sits outside the file's first body and was not read", "units sit outside the file's first body and were not read")}`,
    );
  }
  if (result.sourceLanguageMismatch !== undefined) {
    notes.push(
      `  the file declares source language ${preview(result.sourceLanguageMismatch, LANGUAGE_TAG_PREVIEW)}, which is not the configured source locale`,
    );
  }
  if (result.markupStrippedUnits > 0) {
    notes.push(
      `  ${plural(result.markupStrippedUnits, "unit")} carried inline markup, which was flattened to its text`,
    );
  }
  if (result.subflowDroppedUnits > 0) {
    notes.push(
      `  ${plural(result.subflowDroppedUnits, "unit")} carried sub-flow text inside inline markup, which was left out`,
    );
  }
  notes.push(
    ...renderTmxLanguages("languages matching no configured locale", result.unmatchedLanguages),
  );
  notes.push(
    ...renderTmxLanguages(
      "languages two configured locales could claim",
      result.ambiguousLanguages,
    ),
  );
  notes.push(...renderTmxLanguages("configured locales this run left out", result.notImported));
  if (!result.memoryWritable) {
    notes.push("  the translation memory was written by a newer verbatra and was left untouched");
  }
  if (result.dryRun) {
    notes.push("  dry run: nothing written");
  }
  return notes;
}

export function renderTmxImportHuman(result: ImportTmxResult, base?: string): string {
  const language =
    result.sourceLanguage === undefined
      ? "no source language declared"
      : `source language ${preview(result.sourceLanguage, LANGUAGE_TAG_PREVIEW)}`;
  return [
    `verbatra tmx import <- ${displayPath(result.file, base)}`,
    `  ${plural(result.units, "unit")} read (${language})`,
    ...result.locales.flatMap(renderTmxLocale),
    ...renderTmxNotes(result),
  ].join("\n");
}

export function renderTmxExportHuman(result: ExportTmxResult, base?: string): string {
  const localeLines = result.locales.map(
    (locale) => `  ${locale.locale}: ${plural(locale.units, "segment")}`,
  );
  const withoutSource =
    result.withoutSource > 0
      ? [
          `  ${plural(
            result.withoutSource,
            "entry left out: the memory holds no source text for it",
            "entries left out: the memory holds no source text for them",
          )}`,
        ]
      : [];
  const removed =
    result.illegalCharactersRemoved > 0
      ? [
          `  ${plural(result.illegalCharactersRemoved, "character XML 1.0 does not allow was", "characters XML 1.0 does not allow were")} removed from segment text`,
        ]
      : [];
  return [
    `verbatra tmx export -> ${displayPath(result.path, base)}`,
    ...localeLines,
    `${plural(result.units, "unit")} across ${plural(result.locales.length, "locale")}`,
    ...withoutSource,
    ...removed,
    ...unavailableMarkersLine(
      result.provenanceMarkers,
      "verbatra.provenance.json or verbatra.lock.json",
    ),
  ].join("\n");
}

const BUCKET_LABELS: Readonly<Record<ProvenanceBucket, string>> = {
  "machine-unreviewed": "machine, unreviewed",
  "machine-reviewed": "machine, reviewed",
  human: "human",
  import: "import",
  external: "external",
  unrecorded: "unrecorded",
  unknown: "unknown",
};

function renderTable(rows: readonly (readonly string[])[]): string[] {
  const widths = (rows[0] ?? []).map((_cell, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows.map((row) =>
    `  ${row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")}`.trimEnd(),
  );
}

export function renderProvenanceReportHuman(result: ProvenanceReportResult): string {
  if (!result.available) {
    return [
      "verbatra report provenance",
      "  no report: verbatra.provenance.json is corrupt or from a newer verbatra, so no origin can be read",
    ].join("\n");
  }
  const header = ["locale", ...PROVENANCE_BUCKETS.map((bucket) => BUCKET_LABELS[bucket]), "total"];
  const rows = result.locales.map((locale) => [
    locale.locale,
    ...PROVENANCE_BUCKETS.map((bucket) => String(locale.counts[bucket])),
    String(locale.total),
  ]);
  return [
    `verbatra report provenance (source ${result.sourceLocale}, verbatra ${result.toolVersion}, ${result.generatedAt})`,
    ...renderTable([header, ...rows]),
    "Supporting evidence from verbatra.provenance.json, not legal advice. --json lists every key.",
  ].join("\n");
}
