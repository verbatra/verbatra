import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PILL_CLASS } from "@/components/new-badge";
import { NewPill } from "@/components/new-pill";
import type { Locale } from "@/lib/i18n";
import { RELEASED_VERSIONS } from "@/lib/new-status";
import { isStillNew } from "@/lib/release-line";

export const AVAILABLE_FROM_CLASS = "vk-available-from";

export type AvailableFromProps = {
  version: string;
  pkg?: string;
};

export type AvailableFromCopy = { readonly label: string; readonly detail: string };

export async function availableFromCopy(
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
  if (!isStillNew(pkg === undefined ? { version } : { version, pkg }, RELEASED_VERSIONS))
    return null;
  const [{ detail }, t] = await Promise.all([
    availableFromCopy(version, pkg, locale),
    getTranslations({ locale, namespace: "docs.statusBadges" }),
  ]);
  return (
    <NewPill className={AVAILABLE_FROM_CLASS} title={detail}>
      {t("new")}
    </NewPill>
  );
}

export function AvailableFromPill({ label, detail }: AvailableFromCopy): ReactNode {
  return (
    <span className={`${PILL_CLASS} ${AVAILABLE_FROM_CLASS}`} title={detail}>
      {label}
    </span>
  );
}
