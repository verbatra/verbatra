"use client";

import { buttonClasses } from "@verbatra/ui";
import { type ReactNode, useEffect, useState } from "react";
import type { AnalyticsChoice } from "@/lib/analytics-choice";
import { announceChoice, browserChoice, browserHasSignal } from "@/lib/analytics-client";
import { type Locale, localizedPath } from "@/lib/i18n";

export interface AnalyticsPromptLabels {
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly allow: string;
  readonly decline: string;
  readonly privacy: string;
}

const ROUTE = "/api/analytics";

async function storeChoice(choice: AnalyticsChoice, locale: Locale): Promise<boolean> {
  try {
    await fetch(ROUTE, {
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

export function AnalyticsPrompt({
  locale,
  labels,
}: {
  locale: Locale;
  labels: AnalyticsPromptLabels;
}): ReactNode {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(browserChoice() === undefined && !browserHasSignal());
  }, []);

  if (!visible) return null;

  const choose = async (choice: AnalyticsChoice): Promise<void> => {
    if (!(await storeChoice(choice, locale))) return;
    setVisible(false);
    announceChoice();
  };

  return (
    <section
      aria-label={labels.label}
      className="rr-block fixed inset-x-4 bottom-4 z-40 flex max-w-sm flex-col gap-3 rounded-xl border border-(--border-default) bg-(--surface-card) p-4 text-sm text-(--text-body) shadow-(--shadow-panel) sm:left-auto sm:right-4"
    >
      <p className="m-0 font-medium text-(--text-strong)">{labels.title}</p>
      <p className="m-0">{labels.body}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
          onClick={() => choose("full")}
        >
          {labels.allow}
        </button>
        <button
          type="button"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
          onClick={() => choose("default")}
        >
          {labels.decline}
        </button>
        <a
          href={`${localizedPath(locale, "/privacy")}#analytics`}
          className="underline underline-offset-4"
        >
          {labels.privacy}
        </a>
      </div>
    </section>
  );
}
