import type { KeyProvenance, LocaleGlossary } from "@verbatra/sdk";
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
  };
}

export function hasGlossaryHits(glossary: LocaleGlossary): boolean {
  return glossary.terms.length > 0 || glossary.doNotTranslate.length > 0;
}
