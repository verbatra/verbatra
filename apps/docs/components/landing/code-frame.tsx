import type { ReactNode } from "react";
import { type HighlightLanguage, highlightLandingCode } from "@/lib/landing-highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./islands";

export type CodeFrameProps = {
  code: string;
  lang: HighlightLanguage;
  filename?: string | undefined;
  copy?: { label: string; location: string } | undefined;
  className?: string | undefined;
};

const BODY_CLASS =
  "vk-code-frame-body vk-mono-sm min-w-0 flex-1 leading-6 [&_pre]:py-3 [&_pre]:outline-none [&_pre:focus-visible]:outline-2 [&_pre:focus-visible]:-outline-offset-2 [&_pre:focus-visible]:outline-(--focus-ring)";

export async function CodeFrame({
  code,
  lang,
  filename,
  copy,
  className,
}: CodeFrameProps): Promise<ReactNode> {
  const highlighted = await highlightLandingCode(code, lang);
  const copyButton = copy ? (
    <CopyButton text={code} label={copy.label} location={copy.location} size="sm" />
  ) : null;
  return (
    <figure
      data-code-lang={lang}
      className={cn(
        "vk-code-frame m-0 min-w-0 overflow-hidden rounded-xl border border-fd-border bg-(--v-void)",
        className,
      )}
    >
      {filename ? (
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-fd-border px-4 py-1.5">
          <figcaption className="min-w-0 truncate font-mono text-xs text-(--text-muted)">
            {filename}
          </figcaption>
          {copyButton}
        </div>
      ) : null}
      <div className="flex items-start">
        <div className={BODY_CLASS}>{highlighted}</div>
        {!filename && copyButton ? <div className="shrink-0 py-2 pe-2">{copyButton}</div> : null}
      </div>
    </figure>
  );
}
