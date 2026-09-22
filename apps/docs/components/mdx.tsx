import { Callout } from "fumadocs-ui/components/callout";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import { AvailableFrom, type AvailableFromProps } from "@/components/available-from";
import { DiffPanel } from "@/components/diff-panel";
import {
  DocsHomeBody,
  DocsHomeFeatures,
  DocsHomeHero,
  DocsHomePaths,
  DocsHomeSection,
  DocsHomeSteps,
} from "@/components/docs-home";
import { LaneCards, ReferenceRow, VMark } from "@/components/landing";
import { StudioScreenshot } from "@/components/studio-screenshot";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import CommandLine from "@/components/ui/command-line";
import Tabs from "@/components/ui/tabs";
import { type Locale, localizeHref } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const CALLOUT_CLASS = "vk-callout";

export function getMDXComponents(locale: Locale, components?: MDXComponents): MDXComponents {
  const DefaultAnchor = defaultMdxComponents.a ?? "a";
  return {
    ...defaultMdxComponents,
    a: ({ href, ...rest }: ComponentProps<"a">) => (
      <DefaultAnchor href={localizeHref(locale, href)} {...rest} />
    ),
    Callout: ({ className, ...rest }: ComponentProps<typeof Callout>) => (
      <Callout className={cn(CALLOUT_CLASS, className)} {...rest} />
    ),
    AvailableFrom: (props: AvailableFromProps) => <AvailableFrom {...props} locale={locale} />,
    DiffPanel,
    StudioScreenshot,
    CommandLine,
    Badge,
    Card,
    VTabs: Tabs,
    LaneCards,
    ReferenceRow,
    VMark,
    DocsHomeHero: (props: Omit<ComponentProps<typeof DocsHomeHero>, "locale">) => (
      <DocsHomeHero {...props} locale={locale} />
    ),
    DocsHomeBody,
    DocsHomeSection,
    DocsHomeSteps,
    DocsHomePaths: (props: Omit<ComponentProps<typeof DocsHomePaths>, "locale">) => (
      <DocsHomePaths {...props} locale={locale} />
    ),
    DocsHomeFeatures: (props: Omit<ComponentProps<typeof DocsHomeFeatures>, "locale">) => (
      <DocsHomeFeatures {...props} locale={locale} />
    ),
    ...components,
  };
}
