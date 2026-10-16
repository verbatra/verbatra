import {
  CODE_OF_CONDUCT_URL,
  CONTRIBUTING_URL,
  ISSUES_URL,
  LICENSE_URL,
  SECURITY_URL,
} from "@/components/landing/links";

type ContributionStep = { id: "setup" | "change" | "pullRequest"; command: string };

export const CONTRIBUTION_STEPS: ReadonlyArray<ContributionStep> = [
  { id: "setup", command: "pnpm install" },
  { id: "change", command: "pnpm verify" },
  { id: "pullRequest", command: "pnpm changeset" },
];

type ProjectLink = {
  key: "contributing" | "codeOfConduct" | "license" | "security" | "issues";
  href: string;
};

export const OPEN_SOURCE_LINKS: ReadonlyArray<ProjectLink> = [
  { key: "contributing", href: CONTRIBUTING_URL },
  { key: "codeOfConduct", href: CODE_OF_CONDUCT_URL },
  { key: "license", href: LICENSE_URL },
  { key: "security", href: SECURITY_URL },
  { key: "issues", href: ISSUES_URL },
];
