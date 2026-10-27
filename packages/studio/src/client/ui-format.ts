export const UI_LOCALE = "en";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(UI_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
});

const COUNT_FORMAT = new Intl.NumberFormat(UI_LOCALE);

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : TIMESTAMP_FORMAT.format(date);
}

export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}
