import { PROVIDER_KEYS_ANCHORS } from "./docs-anchors";
import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";

export const COMPARE_LAST_CHECKED = "2026-10-15";

export type CompareTool =
  | "verbatra"
  | "lingo"
  | "tolgee"
  | "weblate"
  | "crowdin"
  | "lokalise"
  | "phrase"
  | "manual";

export const COMPARE_TOOLS: ReadonlyArray<CompareTool> = [
  "verbatra",
  "lingo",
  "tolgee",
  "weblate",
  "crowdin",
  "lokalise",
  "phrase",
  "manual",
];

export type SourcedTool = Exclude<CompareTool, "manual">;

export const COMPARE_TOOL_NAMES: Readonly<Record<SourcedTool, string>> = {
  verbatra: "Verbatra",
  lingo: "Lingo.dev",
  tolgee: "Tolgee",
  weblate: "Weblate",
  crowdin: "Crowdin",
  lokalise: "Lokalise",
  phrase: "Phrase",
};

type SitePage = { readonly page: string; readonly anchors?: LocalizedAnchors };

export type CompareSourceLink = string | SitePage;

type CompareSource = {
  readonly tool: SourcedTool;
  readonly urls: ReadonlyArray<CompareSourceLink>;
};

const SOURCES: ReadonlyArray<CompareSource> = [
  { tool: "verbatra", urls: ["https://github.com/verbatra/verbatra/blob/main/LICENSE"] },
  { tool: "verbatra", urls: [{ page: "/docs/data-handling" }] },
  {
    tool: "verbatra",
    urls: [
      "https://github.com/verbatra/verbatra/blob/main/packages/sdk/src/config/provider-billing.ts",
      { page: "/docs/providers" },
    ],
  },
  { tool: "verbatra", urls: [{ page: "/docs/providers" }] },
  { tool: "verbatra", urls: [{ page: "/docs/providers", anchors: PROVIDER_KEYS_ANCHORS }] },
  { tool: "verbatra", urls: [{ page: "/docs/the-lock-file" }] },
  { tool: "verbatra", urls: [{ page: "/docs/cli" }] },
  {
    tool: "verbatra",
    urls: [{ page: "/docs/github-action" }, { page: "/docs/ci-and-exit-codes" }],
  },
  { tool: "verbatra", urls: [{ page: "/docs/cli/mcp" }] },
  { tool: "verbatra", urls: [{ page: "/docs" }] },
  { tool: "verbatra", urls: [{ page: "/docs/review-in-studio" }] },
  { tool: "verbatra", urls: [{ page: "/docs/formats" }] },
  {
    tool: "lingo",
    urls: [
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/LICENSE.md",
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/packages/cli/package.json",
      "https://registry.npmjs.org/@lingo.dev%2Fcli/latest",
      "https://lingo.dev/en/docs/platform",
    ],
  },
  {
    tool: "lingo",
    urls: [
      "https://lingo.dev/pricing",
      "https://github.com/lingodotdev/lingo.dev",
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/packages/cli/src/cli/localizer/explicit.ts",
    ],
  },
  { tool: "lingo", urls: ["https://lingo.dev/pricing"] },
  {
    tool: "lingo",
    urls: [
      "https://lingo.dev/en/docs/platform/llm-models",
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/packages/cli/src/cli/localizer/explicit.ts",
    ],
  },
  {
    tool: "lingo",
    urls: [
      "https://lingo.dev/pricing",
      "https://lingo.dev/en/docs/platform/llm-models",
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/packages/cli/src/cli/localizer/explicit.ts",
    ],
  },
  { tool: "lingo", urls: ["https://lingo.dev/en/docs/cli", "https://lingo.dev/en/docs/cli/ci"] },
  { tool: "lingo", urls: ["https://lingo.dev/en/docs/cli"] },
  {
    tool: "lingo",
    urls: [
      "https://lingo.dev/en/docs/cli/ci",
      "https://raw.githubusercontent.com/lingodotdev/lingo.dev/main/action.yml",
    ],
  },
  { tool: "lingo", urls: ["https://lingo.dev/en/docs/mcp"] },
  {
    tool: "lingo",
    urls: ["https://lingo.dev/en/docs/platform", "https://github.com/lingodotdev/lingo.dev"],
  },
  { tool: "lingo", urls: ["https://lingo.dev/en/docs/platform", "https://lingo.dev/en/docs"] },
  { tool: "lingo", urls: ["https://lingo.dev/en/docs/cli/formats"] },
  {
    tool: "tolgee",
    urls: [
      "https://raw.githubusercontent.com/tolgee/tolgee-platform/main/LICENSE",
      "https://raw.githubusercontent.com/tolgee/tolgee-platform/main/ee/LICENSE",
      "https://raw.githubusercontent.com/tolgee/tolgee-cli/main/LICENSE",
    ],
  },
  {
    tool: "tolgee",
    urls: [
      "https://docs.tolgee.io/platform/self_hosting/licensing",
      "https://github.com/tolgee/tolgee-platform",
    ],
  },
  { tool: "tolgee", urls: ["https://tolgee.io/pricing"] },
  {
    tool: "tolgee",
    urls: [
      "https://docs.tolgee.io/platform/translation_process/machine_translation",
      "https://docs.tolgee.io/platform/translation_process/ai_translator",
    ],
  },
  {
    tool: "tolgee",
    urls: [
      "https://docs.tolgee.io/platform/translation_process/ai_translator",
      "https://docs.tolgee.io/platform/projects_and_organizations/llm-providers",
      "https://docs.tolgee.io/platform/translation_process/machine_translation",
    ],
  },
  { tool: "tolgee", urls: ["https://docs.tolgee.io/platform/2.x.x/translation_tools"] },
  {
    tool: "tolgee",
    urls: [
      "https://docs.tolgee.io/tolgee-cli/push-pull-strings",
      "https://raw.githubusercontent.com/tolgee/tolgee-cli/main/package.json",
    ],
  },
  {
    tool: "tolgee",
    urls: ["https://github.com/tolgee", "https://docs.tolgee.io/tolgee-cli/push-pull-strings"],
  },
  { tool: "tolgee", urls: ["https://docs.tolgee.io/platform/integrations/mcp_server/about"] },
  {
    tool: "tolgee",
    urls: ["https://github.com/tolgee/tolgee-platform", "https://docs.tolgee.io/js-sdk/in-context"],
  },
  { tool: "tolgee", urls: ["https://github.com/tolgee/tolgee-platform"] },
  {
    tool: "tolgee",
    urls: [
      "https://docs.tolgee.io/platform/supported_formats",
      "https://docs.tolgee.io/platform/formats/flat_yaml",
    ],
  },
  {
    tool: "weblate",
    urls: [
      "https://raw.githubusercontent.com/WeblateOrg/weblate/main/pyproject.toml",
      "https://raw.githubusercontent.com/WeblateOrg/weblate/main/LICENSE",
      "https://raw.githubusercontent.com/WeblateOrg/wlc/main/pyproject.toml",
    ],
  },
  {
    tool: "weblate",
    urls: [
      "https://github.com/WeblateOrg/weblate",
      "https://raw.githubusercontent.com/WeblateOrg/weblate/main/README.rst",
    ],
  },
  { tool: "weblate", urls: ["https://weblate.org/en/hosting/"] },
  { tool: "weblate", urls: ["https://docs.weblate.org/en/latest/admin/machine.html"] },
  { tool: "weblate", urls: ["https://docs.weblate.org/en/latest/admin/machine.html"] },
  {
    tool: "weblate",
    urls: [
      "https://raw.githubusercontent.com/WeblateOrg/weblate/main/weblate/addons/autotranslate.py",
      "https://docs.weblate.org/en/latest/admin/addons.html",
    ],
  },
  { tool: "weblate", urls: ["https://docs.weblate.org/en/latest/wlc.html"] },
  {
    tool: "weblate",
    urls: [
      "https://raw.githubusercontent.com/WeblateOrg/weblate/main/docs/admin/continuous.rst",
      "https://github.com/WeblateOrg",
    ],
  },
  {
    tool: "weblate",
    urls: ["https://github.com/WeblateOrg", "https://github.com/WeblateOrg/weblate/tree/main/docs"],
  },
  {
    tool: "weblate",
    urls: ["https://raw.githubusercontent.com/WeblateOrg/weblate/main/docs/devel/community.rst"],
  },
  {
    tool: "weblate",
    urls: ["https://raw.githubusercontent.com/WeblateOrg/weblate/main/docs/user/translating.rst"],
  },
  {
    tool: "weblate",
    urls: [
      "https://docs.weblate.org/en/latest/formats.html",
      "https://github.com/WeblateOrg/weblate/tree/main/docs/formats",
    ],
  },
  {
    tool: "crowdin",
    urls: ["https://github.com/crowdin/crowdin-cli", "https://github.com/crowdin/github-action"],
  },
  { tool: "crowdin", urls: ["https://crowdin.com/pricing"] },
  { tool: "crowdin", urls: ["https://crowdin.com/pricing"] },
  {
    tool: "crowdin",
    urls: [
      "https://support.crowdin.com/machine-translation/",
      "https://support.crowdin.com/crowdin-ai/",
    ],
  },
  {
    tool: "crowdin",
    urls: [
      "https://support.crowdin.com/machine-translation/",
      "https://support.crowdin.com/crowdin-ai/",
    ],
  },
  {
    tool: "crowdin",
    urls: [
      "https://support.crowdin.com/pre-translation/",
      "https://support.crowdin.com/uploading-files/",
    ],
  },
  { tool: "crowdin", urls: ["https://github.com/crowdin/crowdin-cli"] },
  { tool: "crowdin", urls: ["https://github.com/crowdin/github-action"] },
  { tool: "crowdin", urls: ["https://support.crowdin.com/developer/crowdin-mcp-server/"] },
  { tool: "crowdin", urls: ["https://support.crowdin.com/in-context-localization/"] },
  { tool: "crowdin", urls: ["https://support.crowdin.com/online-editor/"] },
  { tool: "crowdin", urls: ["https://support.crowdin.com/uploading-files/"] },
  {
    tool: "lokalise",
    urls: ["https://raw.githubusercontent.com/lokalise/lokalise-cli-2-go/master/LICENSE"],
  },
  { tool: "lokalise", urls: ["https://lokalise.com/product/security/"] },
  { tool: "lokalise", urls: ["https://lokalise.com/pricing"] },
  {
    tool: "lokalise",
    urls: [
      "https://docs.lokalise.com/en/articles/5166158-machine-translation",
      "https://docs.lokalise.com/en/articles/11776521-what-is-standard-ai-mt-and-pro-ai",
      "https://docs.lokalise.com/en/articles/12292275-ai-frequently-asked-questions",
    ],
  },
  {
    tool: "lokalise",
    urls: [
      "https://docs.lokalise.com/en/articles/5166158-machine-translation",
      "https://docs.lokalise.com/en/articles/12292275-ai-frequently-asked-questions",
    ],
  },
  {
    tool: "lokalise",
    urls: [
      "https://docs.lokalise.com/en/articles/5166158-machine-translation",
      "https://developers.lokalise.com/docs/github-actions",
    ],
  },
  { tool: "lokalise", urls: ["https://docs.lokalise.com/en/articles/3401683-lokalise-cli-v2"] },
  { tool: "lokalise", urls: ["https://developers.lokalise.com/docs/github-actions"] },
  {
    tool: "lokalise",
    urls: [
      "https://docs.lokalise.com/en/articles/13547066-setting-up-and-using-the-lokalise-mcp-server",
    ],
  },
  {
    tool: "lokalise",
    urls: ["https://docs.lokalise.com/en/articles/1592525-livejs-web-in-context-editor"],
  },
  {
    tool: "lokalise",
    urls: ["https://docs.lokalise.com/en/articles/2059009-key-editor-and-key-actions"],
  },
  {
    tool: "lokalise",
    urls: ["https://docs.lokalise.com/en/collections/2909229-supported-file-formats"],
  },
  {
    tool: "phrase",
    urls: [
      "https://raw.githubusercontent.com/phrase/phrase-cli/master/LICENSE",
      "https://github.com/phrase/setup-cli",
      "https://github.com/phrase/react-intl-phraseapp",
    ],
  },
  { tool: "phrase", urls: ["https://phrase.com/pricing/"] },
  { tool: "phrase", urls: ["https://phrase.com/pricing/"] },
  {
    tool: "phrase",
    urls: [
      "https://support.phrase.com/hc/en-us/articles/5821202515996-Machine-Translation-Strings",
      "https://support.phrase.com/hc/en-us/articles/5709660879516-Phrase-Language-AI",
    ],
  },
  {
    tool: "phrase",
    urls: ["https://support.phrase.com/hc/en-us/articles/5709660879516-Phrase-Language-AI"],
  },
  {
    tool: "phrase",
    urls: ["https://support.phrase.com/hc/en-us/articles/5822187934364-Pre-translation-Strings"],
  },
  { tool: "phrase", urls: ["https://developers.phrase.com/en/developer-tools/strings-cli"] },
  {
    tool: "phrase",
    urls: [
      "https://support.phrase.com/hc/en-us/articles/5822060164508-Continuous-Integration-Strings",
      "https://github.com/phrase/setup-cli",
    ],
  },
  { tool: "phrase", urls: ["https://developers.phrase.com/en/mcp-server"] },
  { tool: "phrase", urls: ["https://github.com/phrase/react-intl-phraseapp"] },
  {
    tool: "phrase",
    urls: ["https://support.phrase.com/hc/en-us/articles/5822638157340-Strings-Editor-Overview"],
  },
  {
    tool: "phrase",
    urls: [
      "https://support.phrase.com/hc/en-us/articles/9652464547740-List-of-Supported-File-Types-Strings",
    ],
  },
];

export type CompareFootnote = number | "M";

export function compareSource(footnote: number): CompareSource {
  const source = SOURCES[footnote - 1];
  if (source === undefined) throw new Error(`no comparison source ${footnote}`);
  return source;
}

export const COMPARE_SOURCE_COUNT = SOURCES.length;

export function compareSourceHref(link: CompareSourceLink, locale: Locale): string {
  return typeof link === "string" ? link : localizedAnchorPath(locale, link.page, link.anchors);
}

export type CompareRowId =
  | "license"
  | "selfHosting"
  | "pricing"
  | "providers"
  | "ownKeys"
  | "incremental"
  | "cli"
  | "ci"
  | "mcp"
  | "inContext"
  | "translatorUi"
  | "formats";

export const COMPARE_ROWS: ReadonlyArray<CompareRowId> = [
  "license",
  "selfHosting",
  "pricing",
  "providers",
  "ownKeys",
  "incremental",
  "cli",
  "ci",
  "mcp",
  "inContext",
  "translatorUi",
  "formats",
];

const SOURCE_BLOCK: Readonly<Record<SourcedTool, number>> = {
  verbatra: 0,
  lingo: 1,
  tolgee: 2,
  weblate: 3,
  crowdin: 4,
  lokalise: 5,
  phrase: 6,
};

export function cellFootnote(row: CompareRowId, tool: CompareTool): CompareFootnote {
  if (tool === "manual") return "M";
  const index = COMPARE_ROWS.indexOf(row);
  return SOURCE_BLOCK[tool] * COMPARE_ROWS.length + index + 1;
}

export type ShortColumn = "verbatra" | "lingo" | "tolgee" | "hostedTms" | "manual";

export const SHORT_COLUMNS: ReadonlyArray<ShortColumn> = [
  "verbatra",
  "lingo",
  "tolgee",
  "hostedTms",
  "manual",
];

export const HOSTED_TMS_TOOLS: ReadonlyArray<SourcedTool> = ["crowdin", "lokalise", "phrase"];

export type ShortRowId = Extract<
  CompareRowId,
  "license" | "ownKeys" | "incremental" | "ci" | "mcp"
>;

export const SHORT_ROWS: ReadonlyArray<ShortRowId> = [
  "license",
  "ownKeys",
  "incremental",
  "ci",
  "mcp",
];

export function shortCellFootnotes(
  row: ShortRowId,
  column: ShortColumn,
): ReadonlyArray<CompareFootnote> {
  if (column === "hostedTms") return HOSTED_TMS_TOOLS.map((tool) => cellFootnote(row, tool));
  return [cellFootnote(row, column)];
}

export const COMPARE_PATH = "/compare";

export function fullTableFootnotes(): ReadonlyArray<number> {
  return Array.from({ length: COMPARE_SOURCE_COUNT }, (_, index) => index + 1);
}

export const CONCESSION_FOOTNOTES: ReadonlyArray<CompareFootnote> = [
  ...["tolgee" as const, ...HOSTED_TMS_TOOLS].map((tool) => cellFootnote("inContext", tool)),
  cellFootnote("inContext", "verbatra"),
  cellFootnote("translatorUi", "verbatra"),
];
