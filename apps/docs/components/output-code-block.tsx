import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const OUTPUT_CODE_CLASS = "vk-code-output";

type OutputCodeBlockProps = Omit<ComponentProps<typeof CodeBlock>, "title" | "allowCopy"> & {
  locale: Locale;
};

export async function OutputCodeBlock({
  locale,
  className,
  children,
  ...rest
}: OutputCodeBlockProps): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "docs.codeBlock" });
  return (
    <CodeBlock
      {...rest}
      title={t("output")}
      allowCopy={false}
      className={cn(OUTPUT_CODE_CLASS, className)}
    >
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}
