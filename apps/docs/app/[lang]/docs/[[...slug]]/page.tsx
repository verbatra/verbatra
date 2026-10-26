import { Callout } from "fumadocs-ui/components/callout";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
} from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DocsPageActions } from "@/components/docs-page-actions";
import { JsonLd } from "@/components/json-ld";
import { CALLOUT_CLASS, getMDXComponents } from "@/components/mdx";
import { PageEyebrow } from "@/components/page-eyebrow";
import { PageNeighbours } from "@/components/page-neighbours";
import { sdkReferenceComponents } from "@/components/sdk-reference";
import { docsBreadcrumbTrail } from "@/lib/docs-breadcrumb";
import { footerNeighbourUrls } from "@/lib/docs-neighbours";
import { extractFaqItems, withoutQuestions } from "@/lib/extract-faq";
import { i18n, type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { markdownUrl } from "@/lib/markdown-route";
import { onThisPageLabel, pageToc } from "@/lib/page-toc";
import { socialMetadata } from "@/lib/social-metadata";
import { source } from "@/lib/source";
import { breadcrumbListLd, type FaqItem, faqPageLd, techArticleLd } from "@/lib/structured-data";
import { contentCommitTimes, isTranslationOutdated } from "@/lib/translation-freshness";

const CODE_HEADINGS_CLASS = "vk-code-headings";

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

  const trail = docsBreadcrumbTrail(source.getPageTree(lang), page.url);
  if (trail.length > 0) blocks.push(breadcrumbListLd({ items: trail }));

  if (slug.length === 1 && slug[0] === "faq") {
    const homeFaq = await getTranslations({ locale: lang, namespace: "landing.faq" });
    const homeQuestions = Object.values(homeFaq.raw("items") as Record<string, FaqItem>).map(
      (item) => item.question,
    );
    const items = withoutQuestions(
      extractFaqItems(await page.data.getText("processed")),
      homeQuestions,
    );
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
  setRequestLocale(lang);
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
      slots={{ breadcrumb: PageEyebrow }}
      breadcrumb={{ enabled: !isHome }}
      footer={{
        enabled: !isHome,
        component: <PageNeighbours locale={lang} url={page.url} />,
      }}
      className={isHome ? "max-w-none p-0 md:p-0 xl:p-0" : undefined}
      tabIndex={-1}
    >
      {jsonLd.map((data) => (
        <JsonLd key={String(data["@type"])} data={data} />
      ))}
      {isHome ? null : (
        <header className="vk-page-head">
          <div className="vk-page-head-row">
            <DocsTitle id="page-title">{page.data.title}</DocsTitle>
            <DocsPageActions markdownUrl={markdownHref} githubUrl={editHref} />
          </div>
          <DocsDescription className="vk-page-lead">{page.data.description}</DocsDescription>
        </header>
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
        {editHref ? <EditOnGitHub href={editHref} className="vk-tap" /> : null}
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

  const title = page.data.seoTitle ?? page.data.title;

  return {
    title,
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
      title,
      description: page.data.description,
      image: { path: ogImagePath, alt: page.data.title },
    }),
  };
}
