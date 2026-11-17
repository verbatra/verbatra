import { buttonClasses } from "@verbatra/ui";
import type { ReactNode } from "react";
import { ANALYTICS_ROUTE, type AnalyticsChoice } from "@/lib/analytics-choice";
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

function ChoiceForm({
  locale,
  choice,
  label,
}: {
  locale: Locale;
  choice: AnalyticsChoice;
  label: string;
}): ReactNode {
  return (
    <form method="post" action={ANALYTICS_ROUTE} className="m-0 max-w-full">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="choice" value={choice} />
      <button
        type="submit"
        className={buttonClasses({
          variant: "secondary",
          size: "sm",
          className: "h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-center",
        })}
      >
        {label}
      </button>
    </form>
  );
}

function ChoiceStatus({ choice, label }: { choice: AnalyticsChoice; label: string }): ReactNode {
  return (
    <p
      id={`analytics-${choice}`}
      role="status"
      tabIndex={-1}
      className="m-0 hidden scroll-mt-24 text-sm font-medium text-(--text-strong) target:block"
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
  return (
    <div className="not-prose mt-4 flex flex-col gap-3 rr-block rounded-xl border border-(--border-default) bg-(--surface-card) p-4">
      <ChoiceStatus choice="full" label={labels.statusOptedIn} />
      <ChoiceStatus choice="default" label={labels.statusDefault} />
      <ChoiceStatus choice="off" label={labels.statusOptedOut} />
      <p className="m-0 text-sm text-(--text-body)">{labels.signals}</p>
      <div className="flex flex-wrap gap-3">
        <ChoiceForm locale={locale} choice="full" label={labels.optIn} />
        <ChoiceForm locale={locale} choice="default" label={labels.defaultOnly} />
        <ChoiceForm locale={locale} choice="off" label={labels.optOut} />
      </div>
    </div>
  );
}
