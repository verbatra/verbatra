import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_METADATA,
  PLAYGROUND_SNIPPET_CONFIG,
  PLAYGROUND_SNIPPET_FILE,
  PLAYGROUND_SOURCE_LOCALE,
  PLAYGROUND_TRANSLATIONS,
} from "@/lib/landing-playground";
import { PROVIDER_DISPLAY } from "@/lib/landing-providers";
import { playgroundSnippetLines } from "@/lib/playground-snippet";
import { highlightPlaygroundSnippet } from "@/lib/playground-snippet-highlight";
import { PlaygroundDemo } from "./islands";
import { PlainList } from "./plain-list";
import type { PlaygroundLanguage } from "./playground-demo";
import { ScrollBlock } from "./scroll-block";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const PLAYGROUND_DOCS_LINKS = [
  ["quickstart", "/docs/sdk-quickstart"],
  ["reference", "/docs/sdk"],
  ["providers", "/docs/providers"],
] as const;

const TABLE_CAPTION_ID = "playground-table-caption";

const LINKS_LABEL_ID = "playground-links";

function generatedOn(locale: string): { iso: string; text: string } {
  const date = new Date(PLAYGROUND_METADATA.generatedAt);
  return {
    iso: PLAYGROUND_METADATA.generatedAt.slice(0, 10),
    text: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date),
  };
}

function StaticTable({
  languages,
  caption,
  sourceHeader,
}: {
  languages: ReadonlyArray<PlaygroundLanguage>;
  caption: string;
  sourceHeader: string;
}): ReactNode {
  return (
    <div className="vk-playground-static">
      <ScrollBlock labelledBy={TABLE_CAPTION_ID} className="vk-playground-table-scroll">
        <table className="vk-playground-table">
          <caption id={TABLE_CAPTION_ID}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{sourceHeader}</th>
              {languages.map((language) => (
                <th key={language.code} scope="col">
                  {language.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAYGROUND_ITEMS.map((item) => (
              <tr key={item.id}>
                <th scope="row" lang={PLAYGROUND_SOURCE_LOCALE}>
                  {item.text}
                </th>
                {languages.map((language) => (
                  <td key={language.code} lang={language.code}>
                    {PLAYGROUND_TRANSLATIONS[language.code]?.[item.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBlock>
    </div>
  );
}

export async function Playground(): Promise<ReactNode> {
  const t = await getTranslations("landing.playground");
  const tInstall = await getTranslations("landing.install");
  const locale = toLocale(await getLocale());
  const languages: ReadonlyArray<PlaygroundLanguage> = PLAYGROUND_LANGUAGES.map((code) => ({
    code,
    name: t(`languageNames.${code}`),
  }));
  const generated = generatedOn(locale);
  const snippet = await highlightPlaygroundSnippet(
    playgroundSnippetLines(PLAYGROUND_SNIPPET_CONFIG, PLAYGROUND_LANGUAGES),
  );
  const provider = PROVIDER_DISPLAY[PLAYGROUND_METADATA.provider].label;

  const details = (
    <div className="vk-playground-details">
      <p className="vk-playground-label">{t("label")}</p>
      <p className="sr-only">{t("metadata.label")}</p>
      <dl className="vk-playground-meta">
        <div>
          <dt>{t("metadata.provider")}</dt>
          <dd>{provider}</dd>
        </div>
        <div>
          <dt>{t("metadata.model")}</dt>
          <dd>
            <code>{PLAYGROUND_METADATA.model}</code>
          </dd>
        </div>
        <div>
          <dt>{t("metadata.generated")}</dt>
          <dd>
            <time dateTime={generated.iso}>{generated.text}</time>
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <Section id="playground" className="vk-playground-section">
      <div className="vk-playground-layout">
        <SectionHead
          id="playground-heading"
          layout="inline"
          title={t("heading")}
          lead={t("lead")}
        />
        <PlaygroundDemo
          items={PLAYGROUND_ITEMS}
          languages={languages}
          translations={PLAYGROUND_TRANSLATIONS}
          sourceLocale={PLAYGROUND_SOURCE_LOCALE}
          defaultItem={PLAYGROUND_DEFAULT_ITEM}
          labels={{
            items: t("items"),
            languages: t("languages"),
            translate: t("translate"),
            results: t("results"),
            source: t("source"),
            noLanguages: t("noLanguages"),
            notSelected: t("notSelected"),
            stale: t("stale"),
            copy: t("copy"),
            copyStatus: {
              copy: tInstall("copy"),
              copied: tInstall("copied"),
              copyFailed: tInstall("copyFailed"),
            },
          }}
          snippet={snippet}
          snippetFile={PLAYGROUND_SNIPPET_FILE}
          snippetConfig={PLAYGROUND_SNIPPET_CONFIG}
          details={details}
        />
      </div>
      <StaticTable
        languages={languages}
        caption={t("table.caption")}
        sourceHeader={t("table.source")}
      />
      <div className="vk-playground-links">
        <p id={LINKS_LABEL_ID} className="vk-playground-links-title">
          {t("links.label")}
        </p>
        <PlainList aria-labelledby={LINKS_LABEL_ID} className="vk-playground-links-list">
          {PLAYGROUND_DOCS_LINKS.map(([key, path]) => (
            <li key={key}>
              <IntentPrefetchLink
                href={localizedPath(locale, path)}
                className="vk-prose-link vk-playground-link"
              >
                {t(`links.${key}`)}
              </IntentPrefetchLink>
            </li>
          ))}
        </PlainList>
      </div>
    </Section>
  );
}
