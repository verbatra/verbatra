import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { ComparePage } from "@/components/landing/compare-page";
import { localizedPath, toLocale } from "@/lib/i18n";
import { COMPARE_LAST_CHECKED, COMPARE_PATH } from "@/lib/landing-compare";
import { markdownUrl } from "@/lib/markdown-route";
import { homePath, localeAlternates } from "@/lib/site";
import { socialMetadata } from "@/lib/social-metadata";
import { breadcrumbListLd, techArticleLd } from "@/lib/structured-data";

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "compare.meta" });
  const title = t("title");
  const description = t("description");
  const { canonical, languages } = localeAlternates(locale, COMPARE_PATH);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical, languages, types: { "text/markdown": markdownUrl(canonical) } },
    ...socialMetadata({
      locale,
      path: canonical,
      type: "article",
      title,
      description,
      image: { path: localizedPath(locale, "/compare-og"), alt: t("ogImageAlt") },
    }),
  };
}

export default async function CompareRoute(props: {
  params: Promise<{ lang: string }>;
}): Promise<ReactNode> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "compare" });
  const path = localizedPath(locale, COMPARE_PATH);
  const content = await ComparePage({ locale });

  return (
    <div className="vk-home w-full">
      <JsonLd
        data={breadcrumbListLd({
          items: [
            { name: t("breadcrumbHome"), url: homePath(locale) },
            { name: t("breadcrumbCompare"), url: path },
          ],
        })}
      />
      <JsonLd
        data={techArticleLd({
          title: t("heading"),
          description: t("meta.description"),
          path,
          lang: locale,
          dateModified: COMPARE_LAST_CHECKED,
        })}
      />
      {content}
    </div>
  );
}
