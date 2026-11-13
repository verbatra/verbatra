import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE, checkLocaleLine } from "@/lib/check-demo";

type HeroTerminalLocale = { readonly locale: string };

export const HERO_TERMINAL_LOCALES: ReadonlyArray<HeroTerminalLocale> = [{ locale: "de" }];

type HeroTerminalValue = {
  readonly key: string;
  readonly value: string;
  readonly before?: string;
};

export const HERO_TERMINAL_SOURCE: ReadonlyArray<HeroTerminalValue> = [
  { key: "nav.home", value: "Home" },
  { key: "nav.pricing", value: "Pricing" },
  { key: "nav.docs", value: "Docs" },
  { key: "auth.signIn", value: "Sign in" },
  { key: "auth.signOut", value: "Sign out" },
  { key: "cart.empty", value: "Your cart is empty." },
  { key: "cart.total", value: "Total" },
  { key: "cart.remove", value: "Remove" },
  { key: "profile.greeting", value: "Welcome back, {name}!" },
  { key: "profile.save", value: "Save changes" },
  { key: "errors.notFound", value: "Page not found" },
  { key: "errors.offline", value: "You are offline" },
  { key: "checkout.title", value: "Review and checkout", before: "Checkout" },
  { key: "checkout.pay", value: "Pay and place order", before: "Pay now" },
];

export const HERO_TERMINAL_SYNCED_KEYS: ReadonlyArray<string> = HERO_TERMINAL_SOURCE.filter(
  ({ before }) => before === undefined,
).map(({ key }) => key);

export const HERO_TERMINAL_CHANGED_KEYS: ReadonlyArray<string> = HERO_TERMINAL_SOURCE.filter(
  ({ before }) => before !== undefined,
).map(({ key }) => key);

export const HERO_CHECK_COMMAND = "npx @verbatra/cli check";

export const HERO_TRANSLATE_COMMAND = "npx @verbatra/cli translate";

export const HERO_CHECK_EXIT_CODE = 1;

export const HERO_TRANSLATE_EXIT_CODE = 0;

const stale = HERO_TERMINAL_CHANGED_KEYS.length;
const synced = HERO_TERMINAL_SYNCED_KEYS.length;
const localeCount = HERO_TERMINAL_LOCALES.length;

export const HERO_CHECK_OUTPUT: ReadonlyArray<string> = [
  CHECK_CLI_COMMAND,
  ...HERO_TERMINAL_LOCALES.map(({ locale }) => checkLocaleLine(locale, stale, synced)),
  CHECK_OVERALL_LINE,
];

export const HERO_SENT_STRINGS = stale * localeCount;

export const HERO_TOTAL_STRINGS = (stale + synced) * localeCount;

export const HERO_CHECK_BADGE = `${stale} stale, ${synced} up-to-date`;

export const HERO_TRANSLATE_BADGE = `${stale} translated, ${synced} unchanged`;

export const HERO_TRANSLATE_LOCALE_LINES: ReadonlyArray<string> = HERO_TERMINAL_LOCALES.map(
  ({ locale }) => `${locale}: ${HERO_TRANSLATE_BADGE}`,
);

function indented(line: string): string {
  return `  ${line}`;
}

export const HERO_TRANSLATE_OUTPUT: ReadonlyArray<string> = [
  "verbatra translate",
  ...HERO_TRANSLATE_LOCALE_LINES.map(indented),
  `${localeCount} succeeded, 0 partial, 0 failed`,
];

type HeroTerminalStep = {
  readonly command: string;
  readonly output: ReadonlyArray<string>;
  readonly exitCode: number;
};

export const HERO_TERMINAL_SCRIPT: ReadonlyArray<HeroTerminalStep> = [
  { command: HERO_CHECK_COMMAND, output: HERO_CHECK_OUTPUT, exitCode: HERO_CHECK_EXIT_CODE },
  {
    command: HERO_TRANSLATE_COMMAND,
    output: HERO_TRANSLATE_OUTPUT,
    exitCode: HERO_TRANSLATE_EXIT_CODE,
  },
];

type HeroOgLine = { readonly kind: "command" | "output"; readonly text: string };

export const HERO_OG_LINES: ReadonlyArray<HeroOgLine> = HERO_TERMINAL_SCRIPT.flatMap((step) => [
  { kind: "command" as const, text: step.command },
  ...[step.output[1], step.output.at(-1)].flatMap((text) =>
    text === undefined ? [] : [{ kind: "output" as const, text }],
  ),
]);
