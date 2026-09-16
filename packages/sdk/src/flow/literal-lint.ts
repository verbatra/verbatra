import { resolve } from "node:path";
import { type LiteralScan, scanLiterals } from "@verbatra/extract";
import { buildLiteralRules } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { EXTRACT_NOT_CONFIGURED_MESSAGE, toSourceFs } from "./extract.js";

export type LiteralLintOutcome =
  | { readonly kind: "scanned"; readonly scan: LiteralScan }
  | { readonly kind: "not-run"; readonly detail: string };

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function isCleanLiteralScan(scan: LiteralScan): boolean {
  return scan.findings.length === 0 && scan.diagnostics.length === 0;
}

export function describeLiteralScan(scan: LiteralScan): string {
  const files = plural(scan.scannedFiles, "source file", "source files");
  const found = plural(scan.findings.length, "untranslated literal", "untranslated literals");
  const suppressed = `${scan.suppressed.length} suppressed`;
  const unscanned =
    scan.diagnostics.length === 0
      ? ""
      : `, ${plural(scan.diagnostics.length, "path", "paths")} could not be scanned`;
  return `Scanned ${files}: ${found} found (${suppressed}${unscanned}).`;
}

export async function lintLiterals(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
): Promise<LiteralLintOutcome> {
  const extraction = config.extract;
  if (extraction === undefined) {
    return { kind: "not-run", detail: EXTRACT_NOT_CONFIGURED_MESSAGE };
  }
  try {
    const scan = await scanLiterals(
      {
        cwd,
        roots: extraction.roots.map((root) => resolve(cwd, root)),
        rules: buildLiteralRules(extraction.framework),
        ...(extraction.exclude !== undefined ? { exclude: extraction.exclude } : {}),
        ...(extraction.literals?.ignore !== undefined
          ? { ignore: extraction.literals.ignore }
          : {}),
      },
      toSourceFs(fs),
    );
    return { kind: "scanned", scan };
  } catch (error) {
    return { kind: "not-run", detail: errorMessage(error) };
  }
}
