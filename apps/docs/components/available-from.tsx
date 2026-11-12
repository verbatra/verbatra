import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PILL_CLASS } from "@/components/new-badge";
import { placeAvailableFrom } from "@/lib/docs-version";
import type { Locale } from "@/lib/i18n";
import type { PlacedBadge } from "@/lib/release-lines.mjs";

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
  return (
    <AvailableFromPill
      {...(await availableFromCopy(version, pkg, locale))}
      version={version}
      placed={placeAvailableFrom(pkg, version)}
    />
  );
}

export function versionAttributes(
  version: string,
  placed: PlacedBadge,
): Record<`data-vk-${string}`, string> {
  return {
    "data-vk-pkg": placed.package,
    "data-vk-line": placed.line,
    "data-vk-since": version,
    ...(placed.patch > 0 ? { "data-vk-patch": String(placed.patch) } : {}),
  };
}

export function AvailableFromPill({
  label,
  detail,
  version,
  placed,
}: AvailableFromCopy & { version?: string; placed?: PlacedBadge }): ReactNode {
  const attributes =
    version === undefined || placed === undefined ? {} : versionAttributes(version, placed);
  return (
    <span className={`${PILL_CLASS} ${AVAILABLE_FROM_CLASS}`} title={detail} {...attributes}>
      {label}
    </span>
  );
}
