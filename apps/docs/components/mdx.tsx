import { Callout } from "fumadocs-ui/components/callout";
import { Card } from "fumadocs-ui/components/card";
import { CodeBlock, CodeBlockTabs, Pre } from "fumadocs-ui/components/codeblock";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { TypeTable } from "fumadocs-ui/components/type-table";
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
  DocsHomeStacks,
  DocsHomeSteps,
} from "@/components/docs-home";
import { LaneCards, ReferenceRow, VMark } from "@/components/landing";
import { OutputCodeBlock } from "@/components/output-code-block";
import { StudioScreenshot } from "@/components/studio-screenshot";
import Badge from "@/components/ui/badge";
import CommandLine from "@/components/ui/command-line";
import Tabs from "@/components/ui/tabs";
import { OUTPUT_ATTRIBUTE } from "@/lib/code-block-meta";
import { duplicatesFooter } from "@/lib/docs-neighbours";
import { type Locale, localizeHref } from "@/lib/i18n";
import { isShortInlineCode } from "@/lib/inline-code";
import { cn } from "@/lib/utils";

export const CALLOUT_CLASS = "vk-callout";
export const LINK_CARD_CLASS = "vk-link-card";
export const CODE_TABS_CLASS = "vk-code-tabs";
export const SHORT_CODE_CLASS = "vk-code-short";

const NO_NEIGHBOURS: ReadonlySet<string> = new Set();

export function getMDXComponents(
  locale: Locale,
  components?: MDXComponents,
  footerNeighbours: ReadonlySet<string> = NO_NEIGHBOURS,
): MDXComponents {
  const DefaultAnchor = defaultMdxComponents.a ?? "a";
  return {
    ...defaultMdxComponents,
    a: ({ href, ...rest }: ComponentProps<"a">) => (
      <DefaultAnchor href={localizeHref(locale, href)} {...rest} />
    ),
    code: ({ className, children, ...rest }: ComponentProps<"code">) => (
      <code className={cn(isShortInlineCode(children) && SHORT_CODE_CLASS, className)} {...rest}>
        {children}
      </code>
    ),
    pre: ({
      [OUTPUT_ATTRIBUTE]: output,
      children,
      ...rest
    }: ComponentProps<typeof CodeBlock> & { [OUTPUT_ATTRIBUTE]?: boolean }) =>
      output === true ? (
        <OutputCodeBlock locale={locale} {...rest}>
          {children}
        </OutputCodeBlock>
      ) : (
        <CodeBlock {...rest}>
          <Pre>{children}</Pre>
        </CodeBlock>
      ),
    Callout: ({ className, ...rest }: ComponentProps<typeof Callout>) => (
      <Callout className={cn(CALLOUT_CLASS, className)} {...rest} />
    ),
    Card: ({ className, href, ...rest }: ComponentProps<typeof Card>) => {
      const localized = localizeHref(locale, href);
      if (duplicatesFooter(localized, footerNeighbours)) return null;
      return (
        <Card
          className={cn(LINK_CARD_CLASS, className)}
          {...(localized === undefined ? {} : { href: localized })}
          {...rest}
        />
      );
    },
    CodeBlockTabs: ({ className, ...rest }: ComponentProps<typeof CodeBlockTabs>) => (
      <CodeBlockTabs className={cn(CODE_TABS_CLASS, className)} {...rest} />
    ),
    AvailableFrom: (props: AvailableFromProps) => <AvailableFrom {...props} locale={locale} />,
    DiffPanel,
    Step,
    Steps,
    TypeTable,
    StudioScreenshot,
    CommandLine,
    Badge,
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
    DocsHomeStacks: (props: Omit<ComponentProps<typeof DocsHomeStacks>, "locale">) => (
      <DocsHomeStacks {...props} locale={locale} />
    ),
    DocsHomeFeatures: (props: Omit<ComponentProps<typeof DocsHomeFeatures>, "locale">) => (
      <DocsHomeFeatures {...props} locale={locale} />
    ),
    ...components,
  };
}
