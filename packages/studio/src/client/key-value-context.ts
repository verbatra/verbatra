import type {
  GlossaryDraftCheck,
  GlossaryDraftDoNotTranslateCheck,
  GlossaryDraftTermCheck,
  KeyProvenance,
  LocaleGlossary,
} from "@verbatra/sdk";
import type { RpcCallResult } from "./rpc-client.js";

export type KeyValueContext =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "loaded";
      readonly source: string;
      readonly target: string | undefined;
      readonly description: string | undefined;
      readonly provenance: KeyProvenance | undefined;
      readonly glossary: LocaleGlossary;
      readonly maxLength: number | undefined;
    };

export function deriveKeyValueContext(response: RpcCallResult<"key.context">): KeyValueContext {
  if (!response.ok) {
    return { kind: "error", message: response.error.message };
  }
  const result = response.result;
  return {
    kind: "loaded",
    source: result.source,
    target: result.target,
    description: result.description,
    provenance: result.provenance,
    glossary: result.glossary,
    maxLength: result.maxLength,
  };
}

export function hasGlossaryHits(glossary: LocaleGlossary): boolean {
  return glossary.terms.length > 0 || glossary.doNotTranslate.length > 0;
}

export interface DraftFlag {
  readonly tone: "success" | "warning" | "danger";
  readonly label: string;
}

export function draftTermFlags(check: GlossaryDraftTermCheck | undefined): readonly DraftFlag[] {
  if (check === undefined) {
    return [];
  }
  const flags: DraftFlag[] = [];
  if (check.targetUsed === true) {
    flags.push({ tone: "success", label: "Used" });
  } else if (check.targetUsed === false) {
    flags.push({ tone: "warning", label: "Missing" });
  }
  for (const rendering of check.forbiddenUsed) {
    flags.push({ tone: "danger", label: `Forbidden: ${rendering}` });
  }
  return flags;
}

export function draftFixedTermFlags(
  check: GlossaryDraftDoNotTranslateCheck | undefined,
): readonly DraftFlag[] {
  if (check === undefined) {
    return [];
  }
  return [check.kept ? { tone: "success", label: "Kept" } : { tone: "warning", label: "Missing" }];
}

export function draftCheckFor(
  response: RpcCallResult<"key.context">,
): GlossaryDraftCheck | undefined {
  return response.ok ? response.result.draftCheck : undefined;
}
