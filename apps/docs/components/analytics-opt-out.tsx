import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";

export const ANALYTICS_OPT_OUT_ACTION = "/api/analytics";

export interface AnalyticsOptOutLabels {
  readonly optOut: string;
  readonly optIn: string;
  readonly statusOptedOut: string;
  readonly statusOptedIn: string;
  readonly signals: string;
}

type Choice = "off" | "on";

function ChoiceForm({
  locale,
  choice,
  label,
}: {
  locale: Locale;
  choice: Choice;
  label: string;
}): ReactNode {
  return (
    <form method="post" action={ANALYTICS_OPT_OUT_ACTION} className="m-0">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="choice" value={choice} />
      <button type="submit" className={buttonClasses("secondary", "sm")}>
        {label}
      </button>
    </form>
  );
}

function ChoiceStatus({ choice, label }: { choice: Choice; label: string }): ReactNode {
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
    <div className="not-prose mt-4 flex flex-col gap-3 rounded-xl border border-(--border-default) bg-(--surface-card) p-4">
      <ChoiceStatus choice="off" label={labels.statusOptedOut} />
      <ChoiceStatus choice="on" label={labels.statusOptedIn} />
      <p className="m-0 text-sm text-(--text-body)">{labels.signals}</p>
      <div className="flex flex-wrap gap-3">
        <ChoiceForm locale={locale} choice="off" label={labels.optOut} />
        <ChoiceForm locale={locale} choice="on" label={labels.optIn} />
      </div>
    </div>
  );
}
