import type { ReactNode } from "react";
import { type HighlightLanguage, highlightLandingCode } from "@/lib/landing-highlight";
import { CodeFrameShell } from "./code-frame-shell";
import { CopyButton } from "./islands";

type CodeFrameProps = {
  code: string;
  lang: HighlightLanguage;
  filename?: string | undefined;
  copy?: { label: string } | undefined;
  className?: string | undefined;
};

export async function CodeFrame({
  code,
  lang,
  filename,
  copy,
  className,
}: CodeFrameProps): Promise<ReactNode> {
  const highlighted = await highlightLandingCode(code, lang);
  return (
    <CodeFrameShell
      lang={lang}
      filename={filename}
      action={copy ? <CopyButton text={code} label={copy.label} size="sm" /> : null}
      className={className}
    >
      {highlighted}
    </CodeFrameShell>
  );
}
