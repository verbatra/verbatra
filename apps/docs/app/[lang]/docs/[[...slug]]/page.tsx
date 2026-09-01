import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
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
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/json-ld";
import { getMDXComponents } from "@/components/mdx";
import { extractFaqItems } from "@/lib/extract-faq";
import { i18n, type Locale, toLocale } from "@/lib/i18n";
import { ogAlternateLocales, ogLocale } from "@/lib/site";
import { source } from "@/lib/source";
import {
  type BreadcrumbLdItem,
  breadcrumbListLd,
  faqPageLd,
  techArticleLd,
} from "@/lib/structured-data";

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

  if (source.getPage(slug, i18n.defaultLanguage)?.path === page.path) {
    const notTranslated = await getTranslations({ locale: lang, namespace: "docs.notTranslated" });
    return (
      <Callout type="info" title={notTranslated("title")}>
        {notTranslated("text")}
      </Callout>
    );
  }

  const machineTranslated = await getTranslations({
    locale: lang,
    namespace: "docs.machineTranslated",
  });
  return (
    <Callout type="info" title={machineTranslated("title")}>
      {machineTranslated("text")}{" "}
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
    ? null
    : `https://github.com/verbatra/verbatra/blob/main/apps/docs/content/docs/${page.path}`;

  const jsonLd = await pageJsonLd(page, params.slug, lang);

  return (
    <DocsPage
      toc={isHome ? [] : page.data.toc}
      full={isHome}
      role="main"
      breadcrumb={{ enabled: !isHome, includePage: true }}
      footer={{ enabled: !isHome }}
      className={isHome ? "max-w-none p-0 md:p-0 xl:p-0" : undefined}
    >
      {jsonLd.map((data) => (
        <JsonLd key={String(data["@type"])} data={data} />
      ))}
      {isHome ? null : (
        <>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </>
      )}
      <DocsBody>
        <LocaleNotice page={page} slug={params.slug} lang={lang} />
        <MDX components={getMDXComponents(lang)} />
        {editHref ? <EditOnGitHub href={editHref} /> : null}
      </DocsBody>
    </DocsPage>
  );
}

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

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url, languages },
    openGraph: {
      type: "article",
      siteName: "verbatra",
      locale: ogLocale(lang),
      alternateLocale: ogAlternateLocales(lang),
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: page.data.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: ["/og-image.png"],
    },
  };
}
