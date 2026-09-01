import type { SupportedFormat } from "@verbatra/sdk";
import { plainAnswer } from "@/lib/plain-answer";
import { SITE_URL } from "@/lib/site";

const GITHUB_URL = "https://github.com/verbatra/verbatra";
const GITHUB_ORG_URL = "https://github.com/verbatra";
const NPM_CLI_URL = "https://www.npmjs.com/package/@verbatra/cli";
const NPM_SDK_URL = "https://www.npmjs.com/package/@verbatra/sdk";
const NPM_STUDIO_URL = "https://www.npmjs.com/package/@verbatra/studio";
const NPM_MCP_URL = "https://www.npmjs.com/package/@verbatra/mcp";

const SUPPORTED_FRAMEWORKS = ["React", "Vue", "Angular", "Node.js", "Flutter"];
const SUPPORTED_PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "Gemini",
  "DeepL",
  "Google Cloud Translation",
  "openai-compatible",
];
const FORMAT_LABELS: Readonly<Record<SupportedFormat, string>> = {
  "i18next-json": "i18next",
  "vue-i18n-json": "vue-i18n",
  "next-intl-json": "next-intl",
  "ngx-translate-json": "ngx-translate",
  arb: "ARB",
  yaml: "YAML",
  xliff: "XLIFF",
  properties: "Java/Spring properties",
  "apple-strings": "Apple .strings",
  "apple-xcstrings": "Xcode String Catalog",
  "android-xml": "Android strings.xml",
  "gettext-po": "gettext .po/.pot",
};

const SUPPORTED_FORMATS = Object.values(FORMAT_LABELS);

export const AUTHOR_NAME = "Mario Kreitz";

const AUTHOR = {
  "@type": "Person",
  name: AUTHOR_NAME,
  url: "https://github.com/mariokreitz",
} as const;

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "verbatra",
  url: SITE_URL,
} as const;

const ORGANIZATION_REF = { "@id": ORGANIZATION_ID } as const;

export const SEO_KEYWORDS = [
  "i18n",
  "internationalization",
  "localization",
  "translation automation",
  "locale files",
  "AI translation",
  "incremental translation",
  "CLI",
] as const;

export function softwareApplicationLd(args: {
  description: string;
  lang: string;
  version: string;
  studioVersion: string;
  mcpVersion: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "SoftwareSourceCode"],
    name: "verbatra",
    softwareVersion: args.version,
    description: args.description,
    inLanguage: args.lang,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Node.js >= 22.14.0",
    programmingLanguage: "TypeScript",
    license: "https://opensource.org/licenses/MIT",
    codeRepository: GITHUB_URL,
    downloadUrl: NPM_CLI_URL,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: AUTHOR,
    keywords: [...SEO_KEYWORDS],
    featureList: [
      "Incremental translation - only new or changed keys are sent to the provider",
      `Translation providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      `i18n formats: ${SUPPORTED_FORMATS.join(", ")}`,
      `Frameworks: ${SUPPORTED_FRAMEWORKS.join(", ")}`,
      "Placeholder and ICU integrity checked after every translation",
    ],
    softwareHelp: { "@type": "CreativeWork", url: `${SITE_URL}/docs` },
    sameAs: [GITHUB_URL, NPM_CLI_URL, NPM_SDK_URL, NPM_STUDIO_URL, NPM_MCP_URL],
    hasPart: [
      {
        "@type": "SoftwareApplication",
        name: "verbatra Studio",
        softwareVersion: args.studioVersion,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Node.js >= 22.14.0",
        url: NPM_STUDIO_URL,
        downloadUrl: NPM_STUDIO_URL,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: AUTHOR,
      },
      {
        "@type": "SoftwareApplication",
        name: "verbatra MCP",
        softwareVersion: args.mcpVersion,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Node.js >= 22.14.0",
        url: NPM_MCP_URL,
        downloadUrl: NPM_MCP_URL,
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: AUTHOR,
      },
    ],
  };
}

export function websiteLd(args: { lang: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "verbatra",
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
    itemListElement: args.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: new URL(item.url, SITE_URL).href } : {}),
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

export type HowToStepItem = { name: string; text: string };

export function howToLd(args: {
  name: string;
  steps: ReadonlyArray<HowToStepItem>;
  lang: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: args.name,
    inLanguage: args.lang,
    step: args.steps.map((item, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: item.name,
      text: item.text,
    })),
  };
}

export function techArticleLd(args: {
  title: string;
  description?: string | undefined;
  path: string;
  lang: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: args.title,
    ...(args.description ? { description: args.description } : {}),
    url: new URL(args.path, SITE_URL).href,
    inLanguage: args.lang,
    author: AUTHOR,
    publisher: ORGANIZATION_REF,
    isPartOf: { "@type": "WebSite", name: "verbatra documentation", url: `${SITE_URL}/docs` },
  };
}
