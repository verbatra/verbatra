import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { GITHUB_URL, NPM_CLI } from "./links";

type StatusBadge = {
  key: string;
  src: string;
  href: string;
  altKey: string;
  width: number;
};

const SHIELDS_PARAMS = "style=flat&labelColor=1b1b2b&color=9c27b0";

const STATUS_BADGES: ReadonlyArray<StatusBadge> = [
  {
    key: "cli",
    src: `https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&logo=npm&logoColor=white&${SHIELDS_PARAMS}`,
    href: NPM_CLI,
    altKey: "cliVersionAlt",
    width: 147,
  },
  {
    key: "build",
    src: `https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&label=CI&${SHIELDS_PARAMS}`,
    href: `${GITHUB_URL}/actions/workflows/ci.yml`,
    altKey: "buildAlt",
    width: 82,
  },
  {
    key: "coverage",
    src: `https://img.shields.io/codecov/c/github/verbatra/verbatra?label=coverage&${SHIELDS_PARAMS}`,
    href: "https://codecov.io/gh/verbatra/verbatra",
    altKey: "coverageAlt",
    width: 112,
  },
  {
    key: "license",
    src: `https://img.shields.io/badge/license-MIT-blue?${SHIELDS_PARAMS}`,
    href: `${GITHUB_URL}/blob/main/LICENSE`,
    altKey: "licenseAlt",
    width: 88,
  },
];

export async function StatusBand({
  variant = "band",
}: {
  variant?: "band" | "inline";
}): Promise<ReactNode> {
  const t = await getTranslations("landing.status");
  const inline = variant === "inline";
  return (
    <section
      aria-label={t("label")}
      className={inline ? "mx-auto w-full" : "vk-gutter vk-w-wide mx-auto"}
    >
      <ul
        className={
          inline
            ? "flex flex-wrap items-center gap-x-5 gap-y-3"
            : "flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-fd-border py-5"
        }
      >
        {STATUS_BADGES.map((badge) => (
          <li key={badge.key} className="inline-flex">
            <a
              href={badge.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-6 items-center rounded transition-[filter] hover:brightness-110"
            >
              {/* biome-ignore lint/performance/noImgElement: external SVG badge endpoints are not optimizable by next/image. */}
              <img
                src={badge.src}
                alt={t(badge.altKey)}
                width={badge.width}
                height={20}
                className="block h-5 w-auto"
                loading="lazy"
                decoding="async"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
