"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { CopyAnnouncement } from "@/components/ui/copy-announcement";
import { CopyButton } from "@/components/ui/copy-button";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { trackUmamiEvent } from "@/lib/umami";
import { type CopyStatus, useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { breakUrlsAtSlashes, keepFlagsWhole } from "@/lib/word-breaks";

export const PROMPT_COPIED_RESET_MS = 2000;

export function AiSetupPrompt({ label }: { label?: string } = {}): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <figure
      className="m-0 grid border-t px-3.5 py-2"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <figcaption className="vk-label flex min-h-6 items-center leading-snug">
          {label ?? t("aiLabel")}
        </figcaption>
        <CopyButton
          text={AI_SETUP_PROMPT}
          label={t("copyPromptAria")}
          size="sm"
          onCopied={() => trackUmamiEvent("copy-ai-prompt")}
        />
      </div>
      <p
        lang="en"
        className="m-0 font-sans text-xs leading-(--leading-normal) whitespace-pre-line text-pretty text-[color:var(--text-muted)]"
      >
        {breakUrlsAtSlashes(AI_SETUP_PROMPT, keepFlagsWhole)}
      </p>
    </figure>
  );
}

const GLYPH_PATHS: Record<CopyStatus, ReactNode> = {
  idle: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
    </>
  ),
  copied: <path d="M3 8.5l3.25 3.25L13 5" />,
  failed: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75v3.75M8 11.25v.01" />
    </>
  ),
};

const GLYPH_NAME = { idle: "copy", copied: "check", failed: "failed" } as const;

function CopyGlyph({ status }: { status: CopyStatus }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon={GLYPH_NAME[status]}
    >
      {GLYPH_PATHS[status]}
    </svg>
  );
}

function useResetOnOutsideOrEscape(
  active: boolean,
  root: RefObject<HTMLElement | null>,
  reset: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      reset();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") reset();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, root, reset]);
}

function useEscapeDismiss() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const engaged = hovered || focused;

  useEffect(() => {
    if (!engaged) {
      setDismissed(false);
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [engaged]);

  return {
    dismissed,
    handlers: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}

export function PromptCopyButton({ className }: { className?: string } = {}): ReactNode {
  const t = useTranslations("landing.install");
  const { status, attempts, copy, reset } = useCopyToClipboard({
    resetDelayMs: PROMPT_COPIED_RESET_MS,
    holdFailure: true,
  });
  const failed = status === "failed";
  const popoverId = useId();
  const root = useRef<HTMLDivElement>(null);
  const { dismissed, handlers } = useEscapeDismiss();
  useResetOnOutsideOrEscape(failed, root, reset);

  return (
    <div
      ref={root}
      className={cn("vk-prompt", className)}
      data-dismissed={dismissed}
      data-status={status}
      {...handlers}
    >
      <button
        type="button"
        aria-describedby={popoverId}
        data-copied={status === "copied"}
        onClick={async () => {
          if (await copy(AI_SETUP_PROMPT)) trackUmamiEvent("copy-ai-prompt");
        }}
        className={buttonClasses("secondary", "lg", "vk-prompt-trigger w-full justify-center")}
      >
        <CopyGlyph status={status} />
        <span>{t("promptCta")}</span>
      </button>
      <div id={popoverId} role="tooltip" className="vk-prompt-pop">
        {failed ? (
          <span className="vk-prompt-failed">{t("promptCopyFailed")}</span>
        ) : (
          <span className="vk-label">{t("promptPreviewLabel")}</span>
        )}
        <pre lang="en" className="vk-prompt-text">
          {breakUrlsAtSlashes(AI_SETUP_PROMPT, keepFlagsWhole)}
        </pre>
      </div>
      <CopyAnnouncement
        status={status}
        attempts={attempts}
        copied={t("promptCopied")}
        failed={t("copyFailed")}
      />
    </div>
  );
}
