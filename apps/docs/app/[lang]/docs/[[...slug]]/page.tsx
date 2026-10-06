import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import { Callout } from "fumadocs-ui/components/callout";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/json-ld";
import { CALLOUT_CLASS, getMDXComponents } from "@/components/mdx";
import { sdkReferenceComponents } from "@/components/sdk-reference";
import { footerNeighbourUrls } from "@/lib/docs-neighbours";
import { extractFaqItems } from "@/lib/extract-faq";
import { i18n, type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { markdownUrl } from "@/lib/markdown-route";
import { onThisPageLabel, pageToc } from "@/lib/page-toc";
import { socialMetadata } from "@/lib/social-metadata";
import { source } from "@/lib/source";
import {
  type BreadcrumbLdItem,
  breadcrumbListLd,
  faqPageLd,
  techArticleLd,
} from "@/lib/structured-data";
import { contentCommitTimes, isTranslationOutdated } from "@/lib/translation-freshness";

const CODE_HEADINGS_CLASS = "vk-code-headings";
const BREADCRUMB_CLASS = "vk-breadcrumb";

function breadcrumbTrail(pageUrl: string, lang: Locale): BreadcrumbLdItem[] {
  const items = getBreadcrumbItems(pageUrl, source.getPageTree(lang), { includePage: true });
  const trail: BreadcrumbLdItem[] = [];
  for (const item of items) {
    if (typeof item.name !== "string") continue;
    trail.push({ name: item.name, url: item.url });
  }
  return trail;
}

type DocsPageData = NonNullable<ReturnType<typeof source.getPage>>;

async function pageJsonLd(
  page: DocsPageData,
  slug: string[] | undefined,
  lang: Locale,
): Promise<Array<Record<string, unknown>>> {
  const blocks: Array<Record<string, unknown>> = [
    techArticleLd({
      title: page.data.title,
      description: page.data.description,
      path: page.url,
      lang,
    }),
  ];
  if (!slug || slug.length === 0) return blocks;

  const trail = breadcrumbTrail(page.url, lang);
  if (trail.length > 0) blocks.push(breadcrumbListLd({ items: trail }));

  if (slug.length === 1 && slug[0] === "faq") {
    const items = extractFaqItems(await page.data.getText("processed"));
    if (items.length > 0) blocks.push(faqPageLd({ items, lang }));
  }
  return blocks;
}

async function LocaleNotice({
  page,
  slug,
  lang,
}: {
  page: DocsPageData;
  slug: string[] | undefined;
  lang: Locale;
}) {
  if (lang === i18n.defaultLanguage || !slug || slug.length === 0) return null;

  const sourcePath = source.getPage(slug, i18n.defaultLanguage)?.path;
  if (sourcePath === page.path) {
    const notTranslated = await getTranslations({ locale: lang, namespace: "docs.notTranslated" });
    return (
      <Callout type="info" className={CALLOUT_CLASS} title={notTranslated("title")}>
        {notTranslated("text")}
      </Callout>
    );
  }

  const machineTranslated = await getTranslations({
    locale: lang,
    namespace: "docs.machineTranslated",
  });
  const outdated =
    sourcePath !== undefined && isTranslationOutdated(contentCommitTimes, sourcePath, page.path);
  const outdatedCopy = outdated
    ? await getTranslations({ locale: lang, namespace: "docs.outdatedTranslation" })
    : undefined;
  return (
    <Callout
      type={outdatedCopy ? "warn" : "info"}
      className={CALLOUT_CLASS}
      title={outdatedCopy ? outdatedCopy("title") : machineTranslated("title")}
    >
      {machineTranslated("text")} {outdatedCopy ? `${outdatedCopy("text")} ` : null}
      <Link href={`/docs/${slug.join("/")}`}>{machineTranslated("viewOriginal")}</Link>.
    </Callout>
  );
}

export default async function Page(props: { params: Promise<{ slug?: string[]; lang: string }> }) {
  const params = await props.params;
  const lang = toLocale(params.lang);
  const page = source.getPage(params.slug, lang);
  if (!page) notFound();

  const MDX = page.data.body;

  const isHome = !params.slug || params.slug.length === 0;

  const editHref = isHome
    ? undefined
    : `https://github.com/verbatra/verbatra/blob/main/apps/docs/content/docs/${page.path}`;

  const markdownHref = markdownUrl(page.url);

  const jsonLd = await pageJsonLd(page, params.slug, lang);

  return (
    <DocsPage
      toc={isHome ? [] : pageToc(page.data.toc, page.data.tocDepth)}
      tableOfContentPopover={{ trigger: { "aria-label": onThisPageLabel(lang) } }}
      full={isHome}
      breadcrumb={{ enabled: !isHome, includePage: true, className: BREADCRUMB_CLASS }}
      footer={{ enabled: !isHome, className: "vk-docs-footer" }}
      className={isHome ? "max-w-none p-0 md:p-0 xl:p-0" : undefined}
    >
      {jsonLd.map((data) => (
        <JsonLd key={String(data["@type"])} data={data} />
      ))}
      {isHome ? null : (
        <>
          <DocsTitle id="page-title">{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
          <div className="not-prose -mt-4 flex flex-wrap items-center gap-2">
            <MarkdownCopyButton markdownUrl={markdownHref} />
            <ViewOptionsPopover markdownUrl={markdownHref} githubUrl={editHref} />
          </div>
        </>
      )}
      <DocsBody className={page.data.codeHeadings ? CODE_HEADINGS_CLASS : undefined}>
        <LocaleNotice page={page} slug={params.slug} lang={lang} />
        <MDX
          components={getMDXComponents(
            lang,
            sdkReferenceComponents(lang),
            isHome ? undefined : footerNeighbourUrls(source.getPageTree(lang), page.url),
          )}
        />
        {editHref ? <EditOnGitHub href={editHref} /> : null}
      </DocsBody>
    </DocsPage>
  );
}

export const dynamicParams = false;

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[]; lang: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const lang = toLocale(params.lang);
  const page = source.getPage(params.slug, lang);
  if (!page) notFound();

  const languages: Record<string, string> = {};
  for (const altLocale of i18n.languages) {
    const altPage = source.getPage(params.slug, altLocale);
    if (altPage) languages[altLocale] = altPage.url;
  }
  languages["x-default"] = languages[i18n.defaultLanguage] ?? page.url;

  const ogImageSegments = params.slug ?? [];
  const ogImagePath = localizedPath(
    lang,
    `/docs-og${ogImageSegments.length ? `/${ogImageSegments.join("/")}` : ""}`,
  );

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      languages,
      types: { "text/markdown": markdownUrl(page.url) },
    },
    ...socialMetadata({
      locale: lang,
      path: page.url,
      type: "article",
      title: page.data.title,
      description: page.data.description,
      image: { path: ogImagePath, alt: page.data.title },
    }),
  };
}
