"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";

export type CommandLineLink = { token: string; href: string };

export type HighlightedCommandProps = {
  command: string;
  link?: CommandLineLink;
};

export function HighlightedCommand({ command, link }: HighlightedCommandProps): ReactNode {
  const tokenAt = link ? command.indexOf(link.token) : -1;
  if (!link || tokenAt < 0) return <>{command}</>;

  return (
    <>
      {command.slice(0, tokenAt)}
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex min-h-6 items-center rounded underline decoration-fd-border underline-offset-4 align-middle transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
      >
        {link.token}
      </a>
      {command.slice(tokenAt + link.token.length)}
    </>
  );
}

export type CommandLineProps = {
  command: string;
  link?: CommandLineLink;
};

export default function CommandLine({ command, link }: CommandLineProps): ReactNode {
  const t = useTranslations("landing.install");
  const [copied, copy] = useCopyToClipboard();

  return (
    <div className="not-prose flex max-w-xl items-center gap-3 rounded-xl border border-fd-border bg-fd-card px-4 py-2.5 font-mono text-sm">
      <span className="text-fd-muted-foreground" aria-hidden="true">
        $
      </span>
      <code className="text-fd-foreground">
        <HighlightedCommand command={command} link={link} />
      </code>
      <button
        type="button"
        onClick={() => copy(command)}
        aria-label={t("copyAria")}
        className="ms-auto inline-flex min-h-6 items-center rounded-md border border-fd-border px-2 py-1 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}
