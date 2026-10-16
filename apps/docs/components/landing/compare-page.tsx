import { getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import {
  type AvailableFromCopy,
  AvailableFromPill,
  availableFromCopy,
} from "@/components/available-from";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import {
  type CompareProviderName,
  compareCellText,
  compareProviderNames,
  PROVIDER_LIST_SLOT,
} from "@/lib/compare-cells";
import { type Locale, localizedPath } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  CONCESSION_FOOTNOTES,
  type CompareTool,
  cellFootnote,
  fullTableFootnotes,
} from "@/lib/landing-compare";
import { homePath } from "@/lib/site";
import {
  CompareRegion,
  type CompareTranslator,
  FootnoteRefs,
  SourceList,
  TextWithRefs,
} from "./compare-table";
import { formatLandingDate } from "./hero-facts";

const COMPARE_HEADING_ID = "compare-page-heading";

type BadgedProvider = CompareProviderName & { readonly badge: AvailableFromCopy | null };

async function badgedProviders(locale: Locale): Promise<ReadonlyArray<BadgedProvider>> {
  return Promise.all(
    compareProviderNames().map(async (provider) => ({
      ...provider,
      badge: provider.since ? await availableFromCopy(provider.since, undefined, locale) : null,
    })),
  );
}

function ProviderList({ providers }: { providers: ReadonlyArray<BadgedProvider> }): ReactNode {
  return providers.map((item, index) => (
    <Fragment key={item.id}>
      {index > 0 ? ", " : null}
      <span data-provider={item.id}>{item.label}</span>
      {item.badge ? (
        <>
          {" "}
          <AvailableFromPill {...item.badge} />
        </>
      ) : null}
    </Fragment>
  ));
}

function providersCell(t: CompareTranslator, list: ReactNode): ReactNode {
  const [before = "", after = ""] = compareCellText(
    t,
    "providers",
    "verbatra",
    PROVIDER_LIST_SLOT,
  ).split(PROVIDER_LIST_SLOT);
  return (
    <>
      {before}
      {list}
      {after}
    </>
  );
}

function columnLabel(t: CompareTranslator, tool: CompareTool): string {
  return tool === "manual" ? t("columns.manual") : COMPARE_TOOL_NAMES[tool];
}

export async function ComparePage({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "landing.compare" });
  const page = await getTranslations({ locale, namespace: "compare" });
  const providerList = <ProviderList providers={await badgedProviders(locale)} />;
  const checked = formatLandingDate(COMPARE_LAST_CHECKED, locale);

  return (
    <article
      aria-labelledby={COMPARE_HEADING_ID}
      className="vk-gutter vk-w-wide vk-pad-top-md mx-auto grid gap-(--head-gap) pb-(--section-md)"
    >
      <header className="grid gap-4">
        <h1 id={COMPARE_HEADING_ID} className="vk-h2 max-w-[22ch]">
          {page("heading")}
        </h1>
        <p className="vk-lead max-w-[60ch]">{page("lead")}</p>
      </header>
      <div className="vk-compare vk-compare-full not-prose grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <CompareRegion
          t={t}
          caption={page("caption")}
          tableClassName="min-w-[100rem]"
          columns={COMPARE_TOOLS.map((tool) => ({ id: tool, label: columnLabel(t, tool) }))}
          rows={COMPARE_ROWS.map((row) => ({
            id: row,
            label: t(`rows.${row}.label`),
            cells: COMPARE_TOOLS.map((tool) => ({
              column: tool,
              text: compareCellText(t, row, tool, ""),
              ...(row === "providers" && tool === "verbatra"
                ? { content: providersCell(t, providerList) }
                : {}),
              footnotes: [cellFootnote(row, tool)],
            })),
          }))}
        />
        <div className="grid max-w-[72ch] gap-3 text-sm leading-relaxed text-(--text-muted)">
          <p data-last-checked="">
            {`${t("lastChecked")} `}
            <time dateTime={COMPARE_LAST_CHECKED}>{checked}</time>
          </p>
          <p data-fairness="">{t("fairness")}</p>
          <p data-note="lingo">{withInlineCode(page("lingoNote"))}</p>
          <p data-note="formats">{page("formatsNote")}</p>
          <p data-concession="">
            <TextWithRefs
              text={page("concession")}
              refs={<FootnoteRefs footnotes={CONCESSION_FOOTNOTES} t={t} />}
            />
          </p>
        </div>
      </div>
      <nav aria-labelledby="compare-next-heading" className="grid gap-3">
        <h2 id="compare-next-heading" className="vk-h4 text-(--text-strong)">
          {page("nextHeading")}
        </h2>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-base">
          <li>
            <IntentPrefetchLink
              href={localizedPath(locale, "/docs/quickstart")}
              className="vk-prose-link"
            >
              {page("quickstart")}
            </IntentPrefetchLink>
          </li>
          <li>
            <IntentPrefetchLink href={homePath(locale)} className="vk-prose-link">
              {page("home")}
            </IntentPrefetchLink>
          </li>
        </ul>
      </nav>
      <SourceList
        t={t}
        locale={locale}
        footnotes={fullTableFootnotes()}
        intro={
          <p className="text-xs leading-relaxed text-(--text-muted)" data-sources-checked="">
            {page("sourcesChecked", { date: checked })}
          </p>
        }
      />
    </article>
  );
}
