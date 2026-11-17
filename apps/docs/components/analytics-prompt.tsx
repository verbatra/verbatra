"use client";

import { buttonClasses } from "@verbatra/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ANALYTICS_ROUTE, type AnalyticsChoice } from "@/lib/analytics-choice";
import { announceChoice, browserChoice, browserHasSignal } from "@/lib/analytics-client";
import { type Locale, localizedPath } from "@/lib/i18n";

export interface AnalyticsPromptLabels {
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly allow: string;
  readonly decline: string;
  readonly privacy: string;
  readonly error: string;
}

async function storeChoice(choice: AnalyticsChoice, locale: Locale): Promise<boolean> {
  try {
    await fetch(ANALYTICS_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ choice, lang: locale }).toString(),
      redirect: "manual",
      credentials: "same-origin",
    });
  } catch {
    return false;
  }
  return browserChoice() === choice;
}

const OPEN_ATTRIBUTE = "data-analytics-prompt";
const CLEARANCE_PROPERTY = "--analytics-prompt-clearance";
const CLEARANCE_GAP_PX = 24;

function markPageWhileOpen(region: HTMLElement): () => void {
  const root = document.documentElement;
  const clear = (): void => {
    root.setAttribute(OPEN_ATTRIBUTE, "");
    root.style.setProperty(
      CLEARANCE_PROPERTY,
      `${Math.ceil(region.getBoundingClientRect().height) + CLEARANCE_GAP_PX}px`,
    );
  };
  clear();
  const observer = new ResizeObserver(clear);
  observer.observe(region);
  return () => {
    observer.disconnect();
    root.removeAttribute(OPEN_ATTRIBUTE);
    root.style.removeProperty(CLEARANCE_PROPERTY);
  };
}

export function AnalyticsPrompt({
  locale,
  labels,
}: {
  locale: Locale;
  labels: AnalyticsPromptLabels;
}): ReactNode {
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const region = useRef<HTMLElement>(null);

  useEffect(() => {
    setVisible(browserChoice() === undefined && !browserHasSignal());
  }, []);

  useEffect(() => {
    if (!visible || region.current === null) return;
    const unmark = markPageWhileOpen(region.current);
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setVisible(false);
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      unmark();
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [visible]);

  if (!visible) return null;

  const choose = async (choice: AnalyticsChoice): Promise<void> => {
    if (!(await storeChoice(choice, locale))) {
      setFailed(true);
      return;
    }
    setVisible(false);
    announceChoice();
  };

  const buttonClass = buttonClasses({
    variant: "secondary",
    size: "sm",
    className: "min-h-11 min-w-11",
  });

  return (
    <section
      ref={region}
      aria-label={labels.label}
      className="rr-block fixed inset-x-3 bottom-3 z-40 flex max-w-sm flex-col gap-1 rounded-xl border border-(--border-default) bg-(--surface-card) p-2 text-xs leading-tight text-(--text-body) shadow-(--shadow-panel) sm:inset-x-auto sm:right-4 sm:bottom-4 sm:gap-3 sm:p-4 sm:text-sm sm:leading-normal"
    >
      <p className="m-0 font-medium text-(--text-strong) max-sm:sr-only">{labels.title}</p>
      <p className="m-0">{labels.body}</p>
      {failed ? (
        <p role="status" className="m-0 font-medium text-(--text-strong)">
          {labels.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" className={buttonClass} onClick={() => choose("full")}>
          {labels.allow}
        </button>
        <button type="button" className={buttonClass} onClick={() => choose("default")}>
          {labels.decline}
        </button>
        <a href={`${localizedPath(locale, "/privacy")}#analytics`} className="vk-prose-link">
          {labels.privacy}
        </a>
      </div>
    </section>
  );
}
