import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PILL_CLASS } from "@/components/new-badge";
import type { Locale } from "@/lib/i18n";

export const AVAILABLE_FROM_CLASS = "vk-available-from";

export type AvailableFromProps = {
  version: string;
  pkg?: string;
};

type AvailableFromCopy = { label: string; detail: string };

async function availableFromCopy(
  version: string,
  pkg: string | undefined,
  locale: Locale,
): Promise<AvailableFromCopy> {
  const t = await getTranslations({ locale, namespace: "docs.availableFrom" });
  if (pkg === undefined) {
    return {
      label: t("title", { version }),
      detail: t.markup("text", { version, code: (chunks) => chunks }),
    };
  }
  const release = `${pkg} ${version}`;
  return {
    label: t("packageTitle", { version: release }),
    detail: t("packageText", { version: release }),
  };
}

export async function AvailableFrom({
  version,
  pkg,
  locale,
}: AvailableFromProps & { locale: Locale }): Promise<ReactNode> {
  const { label, detail } = await availableFromCopy(version, pkg, locale);
  return (
    <span className={`${PILL_CLASS} ${AVAILABLE_FROM_CLASS}`} title={detail}>
      {label}
    </span>
  );
}
