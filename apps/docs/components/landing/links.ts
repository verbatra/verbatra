import type { Locale } from "@/lib/i18n";

export const GITHUB_URL = "https://github.com/verbatra/verbatra";
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const NPM_CLI = "https://www.npmjs.com/package/@verbatra/cli";
export const NPM_SDK = "https://www.npmjs.com/package/@verbatra/sdk";
export const NPM_STUDIO = "https://www.npmjs.com/package/@verbatra/studio";
export const NPM_MCP = "https://www.npmjs.com/package/@verbatra/mcp";
export const CONTRIBUTING_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;
export const CODE_OF_CONDUCT_URL = `${GITHUB_URL}/blob/main/CODE_OF_CONDUCT.md`;
export const SECURITY_URL = `${GITHUB_URL}/blob/main/SECURITY.md`;
export const SKILLS_PACK_PAGE = "/docs/agent-recipes";
export const SKILLS_PACK_ANCHORS = {
  en: "the-skills-pack",
  de: "das-skills-paket",
  es: "el-paquete-de-skills",
  fr: "le-pack-de-skills",
} as const satisfies Record<Locale, string>;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

export const LEGAL_PAGE_LINKS = [
  { key: "imprint", path: "/imprint" },
  { key: "privacy", path: "/privacy" },
  { key: "contact", path: "/contact" },
] as const;
