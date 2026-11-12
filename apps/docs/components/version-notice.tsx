import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DocsCallout } from "@/components/docs-callout";
import type { Locale } from "@/lib/i18n";

export const VERSION_NOTICE_CLASS = "vk-version-notice";

export async function VersionNotice({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "docs.versionPicker" });
  return (
    <div className={VERSION_NOTICE_CLASS}>
      <DocsCallout locale={locale} type="info" title={t("noticeTitle")}>
        {t("noticeText")}
      </DocsCallout>
    </div>
  );
}
