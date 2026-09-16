import { discoverSourceFiles } from "../discovery.js";
import { toReportedPath } from "../reported-path.js";
import { DEFAULT_MAX_SOURCE_FILE_BYTES, type ScanDiagnostic } from "../scan-project.js";
import { nodeSourceFs, type SourceFs } from "../source-fs-port.js";
import {
  type FileLiterals,
  type FoundLiteral,
  findLiterals,
  type LiteralRules,
} from "./find-literals.js";
import { boundLiteralText, normalizeLiteralText } from "./literal-text.js";

/**
 * One hardcoded string literal that reads as user-facing text and never went through a translation
 * call. It names where the literal sits and a bounded excerpt of it, never the surrounding source.
 */
export interface LiteralFinding {
  /** The source file, relative to the run's working directory, with forward slashes. */
  readonly file: string;
  /** The one-based line the literal starts on. */
  readonly line: number;
  /** The one-based column the literal starts at: its opening quote, or its first character of JSX text. */
  readonly column: number;
  /** The literal's text with whitespace collapsed, cut to at most 80 characters. */
  readonly text: string;
  /** Whether `text` was cut short. A cut excerpt ends in `...`. */
  readonly truncated: boolean;
}

/**
 * Why a literal that would have been reported was held back.
 *
 * - `directive`: a `verbatra-ignore-next-line` comment above it (the directive covers the next
 *   non-blank line and, when a JSX element starts on that line, the whole element), or a
 *   `verbatra-ignore-line` comment on the same line.
 * - `ignore-list`: its text is listed in `extract.literals.ignore`.
 */
export type LiteralSuppressionReason = "directive" | "ignore-list";

/** A literal the scan found and did not report, kept so a suppression is visible rather than silent. */
export interface SuppressedLiteral extends LiteralFinding {
  /** Which suppression mechanism held it back. */
  readonly reason: LiteralSuppressionReason;
}

/** Everything one untranslated-literal scan found across a project's source. */
export interface LiteralScan {
  /** How many source files were read and scanned. */
  readonly scannedFiles: number;
  /** Literals that look user-facing and were not suppressed, in file then document order. */
  readonly findings: readonly LiteralFinding[];
  /** Literals that were found but suppressed, each with the reason. */
  readonly suppressed: readonly SuppressedLiteral[];
  /**
   * Files and directories the scan could not read to the end. A file listed here was not fully
   * checked, so a scan with any diagnostic is never a clean one.
   */
  readonly diagnostics: readonly ScanDiagnostic[];
}

export interface ScanLiteralsInput {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly rules: LiteralRules;
  readonly exclude?: readonly string[];
  readonly ignore?: readonly string[];
  readonly maxFileBytes?: number;
}

const EXCLUDED_DIRECTORIES = ["__tests__", "__mocks__"];

const NON_APPLICATION_FILE =
  /\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$|\.config\.[cm]?[jt]s$/;

interface LiteralScanState {
  readonly findings: LiteralFinding[];
  readonly suppressed: SuppressedLiteral[];
  readonly diagnostics: ScanDiagnostic[];
  scannedFiles: number;
}

function toFinding(file: string, literal: FoundLiteral): LiteralFinding {
  return { file, line: literal.line, column: literal.column, ...boundLiteralText(literal.text) };
}

function hasExtension(path: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => path.endsWith(extension));
}

function extractLiterals(
  path: string,
  content: string,
  rules: LiteralRules,
): FileLiterals | undefined {
  try {
    return findLiterals(content, rules, hasExtension(path, rules.markupExtensions));
  } catch {
    return undefined;
  }
}

function recordLiterals(
  file: string,
  literals: FileLiterals,
  ignored: ReadonlySet<string>,
  state: LiteralScanState,
): void {
  for (const literal of literals.found) {
    const finding = toFinding(file, literal);
    if (ignored.has(literal.text)) {
      state.suppressed.push({ ...finding, reason: "ignore-list" });
    } else {
      state.findings.push(finding);
    }
  }
  for (const literal of literals.suppressed) {
    state.suppressed.push({ ...toFinding(file, literal), reason: "directive" });
  }
}

async function scanFile(
  path: string,
  input: ScanLiteralsInput,
  ignored: ReadonlySet<string>,
  fs: SourceFs,
  state: LiteralScanState,
): Promise<void> {
  const file = toReportedPath(input.cwd, path);
  const read = await fs.readTextBounded(path, input.maxFileBytes ?? DEFAULT_MAX_SOURCE_FILE_BYTES);
  if (read.kind !== "ok") {
    state.diagnostics.push({ file, reason: read.kind === "missing" ? "unreadable" : "too-large" });
    return;
  }
  const literals = extractLiterals(path, read.content, input.rules);
  if (literals === undefined) {
    state.diagnostics.push({ file, reason: "unparseable" });
    return;
  }
  state.scannedFiles += 1;
  if (literals.truncated) {
    state.diagnostics.push({ file, reason: "unparseable" });
  }
  recordLiterals(file, literals, ignored, state);
}

export async function scanLiterals(
  input: ScanLiteralsInput,
  fs: SourceFs = nodeSourceFs,
): Promise<LiteralScan> {
  const state: LiteralScanState = {
    findings: [],
    suppressed: [],
    diagnostics: [],
    scannedFiles: 0,
  };
  const files = await discoverSourceFiles(
    {
      roots: input.roots,
      extensions: input.rules.extensions,
      exclude: [...EXCLUDED_DIRECTORIES, ...(input.exclude ?? [])],
      onUnreadableDirectory: (path) =>
        state.diagnostics.push({
          file: toReportedPath(input.cwd, path),
          reason: "unreadable-directory",
        }),
    },
    fs,
  );
  const ignored = new Set((input.ignore ?? []).map(normalizeLiteralText));
  for (const path of files.filter((candidate) => !NON_APPLICATION_FILE.test(candidate))) {
    await scanFile(path, input, ignored, fs, state);
  }
  return state;
}
