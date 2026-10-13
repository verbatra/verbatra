import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE, checkLocaleLine } from "@/lib/check-demo";

type HeroTerminalUsage = { readonly inputTokens: number; readonly outputTokens: number };

type HeroTerminalLocale = {
  readonly locale: string;
  readonly usage: HeroTerminalUsage;
};

export const HERO_TERMINAL_LOCALES: ReadonlyArray<HeroTerminalLocale> = [
  { locale: "de", usage: { inputTokens: 318, outputTokens: 41 } },
  { locale: "fr", usage: { inputTokens: 322, outputTokens: 44 } },
];

export const HERO_TERMINAL_SYNCED_KEYS: ReadonlyArray<string> = [
  "nav.home",
  "nav.pricing",
  "nav.docs",
  "auth.signIn",
  "auth.signOut",
  "cart.empty",
  "cart.total",
  "cart.remove",
  "profile.greeting",
  "profile.save",
  "errors.notFound",
  "errors.offline",
];

export const HERO_TERMINAL_NEW_KEYS: ReadonlyArray<string> = ["checkout.title", "checkout.pay"];

export const HERO_CHECK_COMMAND = "npx @verbatra/cli check";

export const HERO_TRANSLATE_COMMAND = "npx @verbatra/cli translate";

export const HERO_CHECK_EXIT_CODE = 1;

export const HERO_TRANSLATE_EXIT_CODE = 0;

function tokens(usage: HeroTerminalUsage): string {
  return `${usage.inputTokens + usage.outputTokens} tokens (${usage.inputTokens} in, ${usage.outputTokens} out)`;
}

function totalUsage(): HeroTerminalUsage {
  return HERO_TERMINAL_LOCALES.reduce<HeroTerminalUsage>(
    (sum, { usage }) => ({
      inputTokens: sum.inputTokens + usage.inputTokens,
      outputTokens: sum.outputTokens + usage.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}

const missing = HERO_TERMINAL_NEW_KEYS.length;
const synced = HERO_TERMINAL_SYNCED_KEYS.length;
const localeCount = HERO_TERMINAL_LOCALES.length;

export const HERO_CHECK_OUTPUT: ReadonlyArray<string> = [
  CHECK_CLI_COMMAND,
  ...HERO_TERMINAL_LOCALES.map(({ locale }) => checkLocaleLine(locale, missing, synced)),
  CHECK_OVERALL_LINE,
];

export const HERO_TRANSLATE_OUTPUT: ReadonlyArray<string> = [
  "verbatra translate",
  ...HERO_TERMINAL_LOCALES.map(
    ({ locale, usage }) =>
      `  ${locale}: ${missing} translated, ${synced} unchanged, ${tokens(usage)}`,
  ),
  `  total: ${tokens(totalUsage())}`,
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

export const HERO_EXIT_LINES: ReadonlyArray<string> = HERO_TERMINAL_SCRIPT.map(
  (step) => `exit ${step.exitCode}`,
);

type HeroOgLine = { readonly kind: "command" | "output"; readonly text: string };

export const HERO_OG_LINES: ReadonlyArray<HeroOgLine> = HERO_TERMINAL_SCRIPT.flatMap((step) => [
  { kind: "command" as const, text: step.command },
  ...[step.output[1], step.output.at(-1)].flatMap((text) =>
    text === undefined ? [] : [{ kind: "output" as const, text }],
  ),
]);

export const HERO_TERMINAL_TITLE = "~/app";
