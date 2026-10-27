export type PlaygroundSnippetConfig = {
  readonly sourceLocale: string;
  readonly format: string;
  readonly filesPattern: string;
  readonly provider: string;
  readonly model: string;
  readonly maxOutputTokens: number;
};

export type PlaygroundSnippetLine = { readonly text: string; readonly locale?: string };

export function playgroundSnippetLines(
  config: PlaygroundSnippetConfig,
  targetLocales: ReadonlyArray<string>,
): ReadonlyArray<PlaygroundSnippetLine> {
  return [
    { text: `import { defineConfig, loadConfig, translate } from "@verbatra/sdk";` },
    { text: "" },
    { text: "const config = await loadConfig({" },
    { text: "  configOverride: defineConfig({" },
    { text: `    sourceLocale: "${config.sourceLocale}",` },
    { text: "    targetLocales: [" },
    ...targetLocales.map((locale) => ({ text: `      "${locale}",`, locale })),
    { text: "    ]," },
    { text: `    format: "${config.format}",` },
    { text: `    files: { pattern: "${config.filesPattern}" },` },
    { text: "    provider: {" },
    { text: `      id: "${config.provider}",` },
    {
      text: `      options: { model: "${config.model}", maxOutputTokens: ${config.maxOutputTokens} },`,
    },
    { text: "    }," },
    { text: "  })," },
    { text: "});" },
    { text: "" },
    { text: "const summary = await translate({ config });" },
  ];
}

export function playgroundSnippet(
  config: PlaygroundSnippetConfig,
  targetLocales: ReadonlyArray<string>,
): string {
  return playgroundSnippetLines(config, targetLocales)
    .map((line) => line.text)
    .join("\n");
}

export function snippetHotVar(locale: string): `--${string}` {
  return `--vk-snippet-hot-${locale}`;
}
