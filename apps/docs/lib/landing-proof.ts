import { CI_WORKFLOW_URL, CODECOV_URL, LICENSE_URL, NPM_CLI } from "@/components/landing/links";
import { type Locale, localizedPath } from "./i18n";
import { FAQ_ANSWER_LINKS } from "./landing-faq";

export const PROOF_IDS = ["provenance", "license", "telemetry", "coverage", "ci"] as const;

export type ProofId = (typeof PROOF_IDS)[number];

const PROOF_HREFS: Readonly<Record<Exclude<ProofId, "telemetry">, string>> = {
  provenance: NPM_CLI,
  license: LICENSE_URL,
  coverage: CODECOV_URL,
  ci: CI_WORKFLOW_URL,
};

export function proofHref(id: ProofId, locale: Locale): string {
  return id === "telemetry"
    ? localizedPath(locale, FAQ_ANSWER_LINKS.privacy.page)
    : PROOF_HREFS[id];
}

export function proofIsExternal(id: ProofId): boolean {
  return id !== "telemetry";
}
