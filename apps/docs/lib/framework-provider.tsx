"use client";

import { FrameworkProvider, type ImageProps } from "fumadocs-core/framework";
import NextImage from "next/image";
import NextLink from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { i18n } from "@/lib/i18n";
import { useLinkPrefetch } from "@/lib/use-painted";

const DEFAULT_LOCALE_PREFIX = `/${i18n.defaultLanguage}`;

function useVisiblePathname(): string {
  const pathname = usePathname();
  if (pathname === DEFAULT_LOCALE_PREFIX) return "/";
  if (pathname.startsWith(`${DEFAULT_LOCALE_PREFIX}/`)) {
    return pathname.slice(DEFAULT_LOCALE_PREFIX.length);
  }
  return pathname;
}

function FrameworkLink({ href, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
  return <NextLink {...props} href={href ?? "#"} prefetch={useLinkPrefetch(prefetch)} />;
}

function toDimension(value: string | number | undefined): number | undefined {
  if (typeof value !== "string") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function FrameworkImage({ src, alt, width, height, ...props }: ImageProps) {
  if (src === undefined) return null;
  return (
    <NextImage
      {...props}
      src={src}
      alt={alt ?? ""}
      width={toDimension(width)}
      height={toDimension(height)}
    />
  );
}

export function LocaleAwareFrameworkProvider({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider
      usePathname={useVisiblePathname}
      useRouter={useRouter}
      useParams={useParams}
      Link={FrameworkLink}
      Image={FrameworkImage}
    >
      {children}
    </FrameworkProvider>
  );
}
