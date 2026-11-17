import {
  ANALYTICS_CHOICE_COOKIE,
  ANALYTICS_CHOICES,
  CHOICE_COOKIE_MAX_AGE_SECONDS,
  LEGACY_OPT_OUT_COOKIE,
} from "@/lib/umami-config.mjs";

export type AnalyticsChoice = (typeof ANALYTICS_CHOICES)[number];

export interface PrivacySignals {
  readonly gpc?: boolean | undefined;
  readonly dnt?: string | boolean | null | undefined;
}

function cookiePairs(header: string | null | undefined): ReadonlyArray<readonly [string, string]> {
  return (header ?? "").split(";").flatMap((pair) => {
    const separator = pair.indexOf("=");
    if (separator < 0) return [];
    return [[pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()] as const];
  });
}

function cookieValue(header: string | null | undefined, name: string): string | undefined {
  return cookiePairs(header).find(([key]) => key === name)?.[1];
}

function isChoice(value: string | undefined): value is AnalyticsChoice {
  return ANALYTICS_CHOICES.some((choice) => choice === value);
}

export function readChoiceCookie(header: string | null | undefined): AnalyticsChoice | undefined {
  const value = cookieValue(header, ANALYTICS_CHOICE_COOKIE);
  return isChoice(value) ? value : undefined;
}

export function hasLegacyOptOut(header: string | null | undefined): boolean {
  return cookieValue(header, LEGACY_OPT_OUT_COOKIE) === "1";
}

export function hasPrivacySignal({ gpc, dnt }: PrivacySignals): boolean {
  return gpc === true || dnt === "1" || dnt === "yes" || dnt === true;
}

export function choiceCookie(choice: AnalyticsChoice): string {
  return `${ANALYTICS_CHOICE_COOKIE}=${choice}; Secure; SameSite=Lax; Path=/; Max-Age=${CHOICE_COOKIE_MAX_AGE_SECONDS}`;
}

export function expiredLegacyOptOutCookie(): string {
  return `${LEGACY_OPT_OUT_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
