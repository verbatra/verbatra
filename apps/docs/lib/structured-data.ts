import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { plainAnswer } from "@/lib/plain-answer";
import { NODE_RANGE, SITE_URL } from "@/lib/site";

const GITHUB_URL = "https://github.com/verbatra/verbatra";
const GITHUB_ORG_URL = "https://github.com/verbatra";
const NPM_CLI_URL = "https://www.npmjs.com/package/@verbatra/cli";
const NPM_SDK_URL = "https://www.npmjs.com/package/@verbatra/sdk";
const NPM_STUDIO_URL = "https://www.npmjs.com/package/@verbatra/studio";
const NPM_MCP_URL = "https://www.npmjs.com/package/@verbatra/mcp";

export const SUPPORTED_FRAMEWORKS = [
  "React",
  "Next.js",
  "Vue",
  "Nuxt",
  "Angular",
  "Node.js",
  "SvelteKit",
  "Astro",
  "React Native",
  "Flutter",
  "Spring",
  "iOS and macOS",
  "Android",
  ".NET",
];
const SUPPORTED_PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "Gemini",
  "DeepL",
  "Google Cloud Translation",
  "openai-compatible",
  "LibreTranslate",
];
export const SUPPORTED_AGENT_CLIENTS = [
  "Claude Code",
  "Codex",
  "Gemini CLI",
  "Cursor",
  "VS Code",
  "GitHub Copilot",
  "Windsurf",
  "Zed",
  "JetBrains AI Assistant",
  "Claude Desktop",
] as const;
const NODE_OPERATING_SYSTEM = `Node.js ${NODE_RANGE}`;

export const ORGANIZATION_LOGO = { path: "/icon-512.png", width: 512, height: 512 } as const;

const SUPPORTED_FORMAT_LABELS = SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label);

export const AUTHOR_NAME = "Mario Kreitz";

export const ENTITY_NAME = "Verbatra";

const AUTHOR_ID = `${SITE_URL}/#author`;

const AUTHOR = {
  "@type": "Person",
  "@id": AUTHOR_ID,
  name: AUTHOR_NAME,
  url: "https://github.com/mariokreitz",
} as const;

const AUTHOR_REF = { "@id": AUTHOR_ID } as const;

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: ENTITY_NAME,
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: new URL(ORGANIZATION_LOGO.path, SITE_URL).href,
    width: ORGANIZATION_LOGO.width,
    height: ORGANIZATION_LOGO.height,
  },
} as const;

const ORGANIZATION_REF = { "@id": ORGANIZATION_ID } as const;

const WEBSITE_ID = `${SITE_URL}/#website`;

const WEBSITE_REF = { "@id": WEBSITE_ID } as const;

export const SEO_KEYWORDS = [
  "i18n",
  "internationalization",
  "localization",
  "translation automation",
  "locale files",
  "AI translation",
  "incremental translation",
  "CLI",
  "MCP server",
  "AI agents",
] as const;

export function softwareApplicationLd(args: {
  description: string;
  lang: string;
  version: string;
  studioVersion: string;
  mcpVersion: string;
  dateModified: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "SoftwareSourceCode"],
    name: ENTITY_NAME,
    softwareVersion: args.version,
    dateModified: args.dateModified,
    description: args.description,
    inLanguage: args.lang,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: NODE_OPERATING_SYSTEM,
    programmingLanguage: "TypeScript",
    license: "https://opensource.org/licenses/MIT",
    codeRepository: GITHUB_URL,
    downloadUrl: NPM_CLI_URL,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: AUTHOR_REF,
    keywords: [...SEO_KEYWORDS],
    featureList: [
      "Incremental translation - only new or changed keys are sent to the provider",
      `Translation providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      `i18n formats: ${SUPPORTED_FORMAT_LABELS.join(", ")}`,
      `Frameworks: ${SUPPORTED_FRAMEWORKS.join(", ")}`,
      "Placeholder, ICU, and inline markup integrity checked after every translation",
      "Human-only mode: the none provider turns machine translation off and hands every key to a translator",
      `AI agent ready: a stdio MCP server for ${SUPPORTED_AGENT_CLIENTS.join(", ")}, JSON output with stable exit codes, and installable agent skills`,
    ],
    softwareHelp: { "@type": "CreativeWork", url: `${SITE_URL}/docs` },
    sameAs: [GITHUB_URL, NPM_CLI_URL, NPM_SDK_URL, NPM_STUDIO_URL, NPM_MCP_URL],
    hasPart: [
      {
        "@type": "SoftwareApplication",
        name: "Verbatra Studio",
        softwareVersion: args.studioVersion,
        applicationCategory: "DeveloperApplication",
        operatingSystem: NODE_OPERATING_SYSTEM,
        url: NPM_STUDIO_URL,
        downloadUrl: NPM_STUDIO_URL,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: AUTHOR_REF,
      },
      {
        "@type": "SoftwareApplication",
        name: "Verbatra MCP server",
        softwareVersion: args.mcpVersion,
        applicationCategory: "DeveloperApplication",
        operatingSystem: NODE_OPERATING_SYSTEM,
        url: NPM_MCP_URL,
        downloadUrl: NPM_MCP_URL,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: AUTHOR_REF,
      },
    ],
  };
}

export function websiteLd(args: { lang: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: ENTITY_NAME,
    url: SITE_URL,
    inLanguage: args.lang,
    author: AUTHOR,
    publisher: ORGANIZATION_REF,
  };
}

export function organizationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    ...ORGANIZATION,
    sameAs: [GITHUB_ORG_URL],
  };
}

export type BreadcrumbLdItem = { name: string; url?: string | undefined };

export function breadcrumbListLd(args: {
  items: ReadonlyArray<BreadcrumbLdItem>;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: args.items
      .filter((item) => item.url)
      .map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: new URL(item.url ?? "", SITE_URL).href,
      })),
  };
}

export type FaqItem = { question: string; answer: string };

export function faqPageLd(args: {
  items: ReadonlyArray<FaqItem>;
  lang: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: args.lang,
    mainEntity: args.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: plainAnswer(item.answer) },
    })),
  };
}

export function techArticleLd(args: {
  title: string;
  description?: string | undefined;
  path: string;
  lang: string;
  datePublished?: string | undefined;
  dateModified?: string | undefined;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: args.title,
    ...(args.description ? { description: args.description } : {}),
    url: new URL(args.path, SITE_URL).href,
    inLanguage: args.lang,
    ...(args.datePublished ? { datePublished: args.datePublished } : {}),
    ...(args.dateModified ? { dateModified: args.dateModified } : {}),
    author: AUTHOR_REF,
    publisher: ORGANIZATION_REF,
    isPartOf: WEBSITE_REF,
  };
}
