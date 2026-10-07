"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";

export type CommandLineLink = { token: string; href: string };

export type HighlightedCommandProps = {
  command: string;
  link?: CommandLineLink;
};

function Words({ text }: { text: string }): ReactNode {
  return text.split(/(\s+)/).map((part, index) =>
    part.trim() === "" ? (
      part
    ) : (
      <span key={`${index}-${part}`} className="whitespace-nowrap">
        {part}
      </span>
    ),
  );
}

export function HighlightedCommand({ command, link }: HighlightedCommandProps): ReactNode {
  const tokenAt = link ? command.indexOf(link.token) : -1;
  if (!link || tokenAt < 0) return <Words text={command} />;

  return (
    <>
      <Words text={command.slice(0, tokenAt)} />
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => event.stopPropagation()}
        className="inline rounded align-baseline underline decoration-fd-border underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
      >
        {link.token}
      </a>
      <Words text={command.slice(tokenAt + link.token.length)} />
    </>
  );
}

export type CommandLineProps = {
  command: string;
  link?: CommandLineLink;
};

export default function CommandLine({ command, link }: CommandLineProps): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <div className="not-prose flex w-full max-w-xl min-w-0 items-center gap-3 rounded-xl border border-fd-border bg-fd-card px-4 py-2.5 font-mono text-sm">
      <span className="text-fd-muted-foreground" aria-hidden="true">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-left text-fd-foreground">
        <HighlightedCommand command={command} link={link} />
      </code>
      <CopyButton text={command} label={t("copyAria")} size="sm" className="ms-auto" />
    </div>
  );
}
