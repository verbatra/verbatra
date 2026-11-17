"use client";

import { buttonClasses } from "@verbatra/ui";
import { type ReactNode, useEffect, useState } from "react";
import { ANALYTICS_ROUTE, type AnalyticsChoice } from "@/lib/analytics-choice";
import { browserChoice, CHOICE_EVENT } from "@/lib/analytics-client";
import type { Locale } from "@/lib/i18n";

export interface AnalyticsOptOutLabels {
  readonly optIn: string;
  readonly defaultOnly: string;
  readonly optOut: string;
  readonly statusOptedIn: string;
  readonly statusDefault: string;
  readonly statusOptedOut: string;
  readonly signals: string;
}

const CHOICES: ReadonlyArray<AnalyticsChoice> = ["full", "default", "off"];

function ChoiceForm({
  locale,
  choice,
  label,
  stored,
}: {
  locale: Locale;
  choice: AnalyticsChoice;
  label: string;
  stored: AnalyticsChoice | undefined;
}): ReactNode {
  return (
    <form method="post" action={ANALYTICS_ROUTE} className="m-0 max-w-full">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="choice" value={choice} />
      <button
        type="submit"
        {...(stored === undefined ? {} : { "aria-pressed": stored === choice })}
        className={buttonClasses({
          variant: stored === choice ? "primary" : "secondary",
          size: "sm",
          className: "h-auto min-h-11 max-w-full whitespace-normal py-1.5 text-center",
        })}
      >
        {label}
      </button>
    </form>
  );
}

function ChoiceStatus({
  choice,
  label,
  shown,
}: {
  choice: AnalyticsChoice;
  label: string;
  shown: boolean;
}): ReactNode {
  return (
    <p
      id={`analytics-${choice}`}
      role="status"
      tabIndex={-1}
      className={`m-0 scroll-mt-24 text-sm font-medium text-(--text-strong) ${shown ? "block" : "hidden target:block"}`}
    >
      {label}
    </p>
  );
}

export function AnalyticsOptOut({
  locale,
  labels,
}: {
  locale: Locale;
  labels: AnalyticsOptOutLabels;
}): ReactNode {
  const [stored, setStored] = useState<AnalyticsChoice | undefined>(undefined);

  useEffect(() => {
    const read = (): void => setStored(browserChoice());
    read();
    window.addEventListener(CHOICE_EVENT, read);
    return () => window.removeEventListener(CHOICE_EVENT, read);
  }, []);

  const statusLabels: Record<AnalyticsChoice, string> = {
    full: labels.statusOptedIn,
    default: labels.statusDefault,
    off: labels.statusOptedOut,
  };
  const visibleStatuses = stored === undefined ? CHOICES : [stored];

  return (
    <div className="not-prose mt-4 flex flex-col gap-3 rr-block rounded-xl border border-(--border-default) bg-(--surface-card) p-4">
      {visibleStatuses.map((choice) => (
        <ChoiceStatus
          key={choice}
          choice={choice}
          label={statusLabels[choice]}
          shown={stored !== undefined}
        />
      ))}
      <p className="m-0 text-sm text-(--text-body)">{labels.signals}</p>
      <div className="flex flex-wrap gap-3">
        <ChoiceForm locale={locale} choice="full" label={labels.optIn} stored={stored} />
        <ChoiceForm locale={locale} choice="default" label={labels.defaultOnly} stored={stored} />
        <ChoiceForm locale={locale} choice="off" label={labels.optOut} stored={stored} />
      </div>
    </div>
  );
}
